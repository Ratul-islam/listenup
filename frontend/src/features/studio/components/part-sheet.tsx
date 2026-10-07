import { useToast } from 'heroui-native';
import { ChevronDown, CirclePlay, Download, ListPlus, Lock, LockOpen, Mic, Pause, RotateCcw, SpellCheck2, TextQuote, Trash2 } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { ActionSheet, SheetAction } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ChoiceChips } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { FolderPickCancelled, saveToFolder } from '@/features/exports/lib/save-to-folder';
import type { ReaderChunk } from '@/features/library/types';
import { playbackApi } from '@/features/player/api/playback.api';
import { PronunciationForm } from '@/features/pronunciations/components/pronunciation-form';
import { usePronunciations } from '@/features/pronunciations/hooks';
import { VoiceList } from '@/features/voices/components/voice-list';
import { useUsage, useVoice } from '@/features/voices/hooks/use-voices';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { usePartMutations } from '../hooks/use-scripts';
import { costLabel, formatClock, secondsToSay } from '../lib/time';

type Mode = 'part' | 'sentences' | 'voice' | 'pause' | 'words' | 'pronounce' | 'add' | 'delete';

interface PartSheetProps {
  documentId: string;
  /** The script's title, for a downloaded part's file name */
  title: string;
  part: ReaderChunk | null;
  /** The script's voice for this part's language, when the part has none of its own */
  scriptVoiceId?: string;
  /** Whether the voice is made on the phone (free) */
  free: boolean;
  /** The script has just this part, so it can't be deleted */
  onlyPart: boolean;
  /** Plays from a part, or from a character in it */
  onPlay: (index: number, char?: number) => void;
  onClose: () => void;
}

const fieldClass = 'rounded-2xl border border-field-border bg-field px-4 py-3.5 font-sans text-[16px] leading-6 text-foreground';
// Words to offer for "Fix how a word sounds", in any script
const WORDS = /[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'’.+-]*[\p{L}\p{M}\p{N}+]|[\p{L}\p{N}]/gu;
const PAUSES = [0, 500, 1000, 1500, 2000, 3000];
const pauseLabel = (ms: number) => (ms ? `${ms / 1000} s` : 'None');

/**
 * One part of a script and everything about it: its words, its voice, the
 * pause after it, its lock, and fixing a single sentence. Every action that
 * records audio says up front what it costs; only that part (or sentence) is
 * voiced again.
 */
export function PartSheet(props: PartSheetProps) {
  const { part } = props;
  // A fresh editor for each part (and after its text changes), so it starts from the saved text
  return part ? <PartEditor key={`${part.index}:${part.text}`} {...props} part={part} /> : null;
}

function PartEditor({ documentId, title, part, scriptVoiceId, free, onlyPart, onPlay, onClose }: PartSheetProps & { part: ReaderChunk }) {
  const t = useTokens();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('part');
  const [text, setText] = useState(part.text);
  const [added, setAdded] = useState('');
  const [word, setWord] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const parts = usePartMutations(documentId);
  const pronunciations = usePronunciations();
  const usage = useUsage();
  const voiceId = part.ownVoiceId ?? part.voiceId ?? scriptVoiceId;
  const voice = useVoice(voiceId);
  const locked = !!part.locked;

  const known = useMemo(() => new Set((pronunciations.data ?? []).map((p) => p.word.toLowerCase())), [pronunciations.data]);
  const words = useMemo(() => [...new Set(part.text.match(WORDS) ?? [])].slice(0, 80), [part.text]);
  const sentences = useMemo(
    () =>
      (part.sentences.length ? part.sentences : [{ start: 0, end: part.text.length, paragraphStart: true }])
        .map((s, i) => ({ ...s, index: i, text: part.text.slice(s.start, s.end).trim() }))
        .filter((s) => s.text),
    [part.sentences, part.text],
  );

  const changed = text.trim() !== part.text.trim() && text.trim().length > 0;
  const length = formatClock(part.estimatedMs / 1000);
  const partCost = costLabel(part.estimatedMs / 1000, free);
  const fail = (e: unknown) => {
    haptics.error();
    setError(getErrorMessage(e));
  };
  const settings = (body: Parameters<typeof parts.settings.mutate>[0]) => parts.settings.mutate(body, { onError: fail });

  const save = () =>
    parts.edit.mutate(
      { index: part.index, text: text.trim() },
      {
        onSuccess: ({ parts: saved }) => {
          haptics.success();
          toast.show({
            variant: 'success',
            label: saved.length > 1 ? `Saved as ${saved.length} parts` : 'Part saved',
            description: 'Only this part is voiced again. The rest of the script is reused.',
          });
          onClose();
        },
        onError: fail,
      },
    );

  const retake = () =>
    parts.retake.mutate(part.index, {
      onSuccess: () => {
        onClose();
        onPlay(part.index);
      },
      onError: fail,
    });

  const redoSentence = (sentence: (typeof sentences)[number]) =>
    parts.retakeSentence.mutate(
      { index: part.index, sentence: sentence.index },
      {
        onSuccess: () => {
          haptics.success();
          onClose();
          onPlay(part.index, sentence.start);
        },
        onError: fail,
      },
    );

  // One part as its own MP3 (Plus and Pro, like full downloads)
  const download = async () => {
    if (usage.data?.plan.id === 'free') return setError('Downloading audio is part of Plus and Pro.');
    setSaving(true);
    setError(null);
    try {
      const audio = await playbackApi.audio(documentId, part.index);
      const name = await saveToFolder([{ url: audio.url, ext: 'mp3' }], `${title} – part ${part.index + 1}`);
      haptics.success();
      toast.show({ variant: 'success', label: 'Part saved', description: `In ${name}` });
    } catch (e) {
      if (!(e instanceof FolderPickCancelled)) fail(e);
    } finally {
      setSaving(false);
    }
  };

  const titles: Record<Mode, string> = {
    part: `Part ${part.index + 1}${locked ? ' · locked' : ''}`,
    sentences: 'Fix one sentence',
    voice: 'Voice for this part',
    pause: 'Pause after this part',
    words: 'Which word?',
    pronounce: 'Fix how it sounds',
    add: `New part after part ${part.index + 1}`,
    delete: 'Delete this part?',
  };

  return (
    <ActionSheet visible onClose={onClose} title={titles[mode]}>
      {mode === 'part' ? (
        <View className="gap-2">
          {locked ? (
            <ScrollView style={{ maxHeight: 200 }} className="rounded-2xl bg-surface-secondary px-4 py-3">
              <Text className="text-[16px] leading-6">{part.text}</Text>
            </ScrollView>
          ) : (
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="top"
              accessibilityLabel={`Text of part ${part.index + 1}`}
              className={`${fieldClass} max-h-[220px] min-h-[110px]`}
            />
          )}

          {!changed ? (
            <View className="flex-row flex-wrap gap-2 py-1">
              <Pill
                icon={<Mic size={14} color={t.accent} />}
                label={voice?.name ?? 'Voice'}
                detail={part.ownVoiceId ? undefined : 'script'}
                disabled={locked}
                onPress={() => setMode('voice')}
              />
              <Pill icon={<Pause size={14} color={t.accent} />} label={part.pauseAfterMs ? `${part.pauseAfterMs / 1000} s pause` : 'No pause'} onPress={() => setMode('pause')} />
              <Pill
                icon={locked ? <Lock size={14} color={t.accent} /> : <LockOpen size={14} color={t.accent} />}
                label={locked ? 'Locked' : 'Lock'}
                active={locked}
                onPress={() => settings({ index: part.index, locked: !locked })}
              />
            </View>
          ) : null}
          {locked && !changed ? (
            <Text variant="caption">Locked parts keep this recording: AI direction, style changes, new pronunciations and find and replace leave them alone.</Text>
          ) : null}

          <InlineAlert message={error} />
          {changed ? (
            <View className="gap-2 pt-1">
              <PrimaryButton label="Save this part" isLoading={parts.edit.isPending} onPress={save} />
              <Text variant="caption" className="text-center">Only this part is voiced again ({partCost}). Everything else is reused.</Text>
              <Pressable onPress={() => setText(part.text)} accessibilityRole="button" className="self-center rounded-full px-3 py-1.5 active:bg-default">
                <Text className="text-[14px] font-medium text-accent">Undo changes</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <SheetAction icon={<CirclePlay size={18} color={t.foreground} />} label="Play from here" detail={length} onPress={() => onPlay(part.index)} />
              {!locked ? (
                <>
                  {sentences.length > 1 && !free ? (
                    <SheetAction
                      icon={<TextQuote size={18} color={t.foreground} />}
                      label="Fix one sentence"
                      detail="Record just that sentence again, not the whole part"
                      onPress={() => setMode('sentences')}
                    />
                  ) : null}
                  <SheetAction
                    icon={<RotateCcw size={18} color={t.foreground} />}
                    label="New take of the whole part"
                    detail={partCost}
                    disabled={parts.retake.isPending}
                    onPress={retake}
                  />
                  <SheetAction icon={<SpellCheck2 size={18} color={t.foreground} />} label="Fix how a word sounds" onPress={() => setMode('words')} />
                  <SheetAction icon={<ListPlus size={18} color={t.foreground} />} label="Add a part after this" onPress={() => setMode('add')} />
                </>
              ) : null}
              {!free ? (
                <SheetAction icon={<Download size={18} color={t.foreground} />} label="Download this part" detail="MP3 · Plus" disabled={saving} onPress={() => void download()} />
              ) : null}
              {!locked ? <SheetAction icon={<Trash2 size={18} color={t.danger} />} label="Delete part" destructive onPress={() => setMode('delete')} /> : null}
            </View>
          )}
        </View>
      ) : null}

      {mode === 'sentences' ? (
        <View className="gap-2">
          <Text variant="caption">
            Only the sentence you redo is recorded again. It&apos;s recorded on its own, so its tone can differ a little; if it stands out, take the whole part again instead.
          </Text>
          <InlineAlert message={error} />
          <ScrollView style={{ maxHeight: 420 }} contentContainerClassName="gap-2 pb-2">
            {sentences.map((s) => {
              const take = part.sentenceTakes?.[String(s.index)];
              return (
                <View key={s.index} className="gap-2 rounded-2xl bg-surface-secondary p-3">
                  <Text className="text-[15px] leading-[22px]">{s.text}</Text>
                  <View className="flex-row items-center gap-2">
                    {take ? <Text variant="caption" className="flex-1">Take {take + 1}</Text> : <View className="flex-1" />}
                    <Pressable
                      onPress={() => onPlay(part.index, s.start)}
                      accessibilityRole="button"
                      accessibilityLabel="Play from this sentence"
                      className="size-9 items-center justify-center rounded-full active:bg-default"
                    >
                      <CirclePlay size={20} color={t.foreground} />
                    </Pressable>
                    <Pressable
                      onPress={() => redoSentence(s)}
                      disabled={parts.retakeSentence.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={`Redo this sentence, about ${secondsToSay(s.text, part.language)} seconds of your minutes`}
                      className="flex-row items-center gap-1.5 rounded-full bg-accent-soft-bg px-3 py-2 active:opacity-80"
                    >
                      <RotateCcw size={14} color={t.accent} />
                      <Text className="text-[13px] font-semibold text-accent-soft-fg">Redo · {formatClock(secondsToSay(s.text, part.language))}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {mode === 'voice' ? (
        <View className="gap-2">
          <Text variant="caption">Give a character their own voice. Only this part changes; it&apos;s voiced again in the new voice.</Text>
          {part.ownVoiceId ? (
            <SheetAction icon={<Mic size={18} color={t.foreground} />} label="Use the script's voice" onPress={() => settings({ index: part.index, voiceId: null })} />
          ) : null}
          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            <VoiceList
              languages={[part.language]}
              selectedIds={voiceId ? [voiceId] : []}
              onSelect={(v) => settings({ index: part.index, voiceId: v.id === scriptVoiceId && !part.ownVoiceId ? null : v.id })}
            />
          </ScrollView>
        </View>
      ) : null}

      {mode === 'pause' ? (
        <View className="gap-2">
          <Text variant="caption">Silence after this part, for a beat before the next line or room for a cut. It&apos;s in the player, the MP3 and the subtitles, and costs nothing.</Text>
          <View className="-mx-3">
            <ChoiceChips options={PAUSES} value={part.pauseAfterMs ?? 0} format={pauseLabel} onChange={(pauseAfterMs) => settings({ index: part.index, pauseAfterMs })} />
          </View>
        </View>
      ) : null}

      {mode === 'words' ? (
        <ScrollView style={{ maxHeight: 360 }} contentContainerClassName="flex-row flex-wrap gap-2 pb-2">
          {words.map((w) => {
            const has = known.has(w.toLowerCase());
            return (
              <Pressable
                key={w}
                onPress={() => {
                  setWord(w);
                  setMode('pronounce');
                }}
                accessibilityRole="button"
                accessibilityLabel={has ? `${w}, has a pronunciation` : w}
                className={`rounded-full px-3.5 py-2 active:opacity-80 ${has ? 'bg-accent-soft-bg' : 'bg-surface-secondary'}`}
              >
                <Text className={`text-[15px] ${has ? 'font-semibold text-accent-soft-fg' : 'font-medium'}`}>{w}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {mode === 'pronounce' && word ? (
        <PronunciationForm
          existing={pronunciations.data?.find((p) => p.word.toLowerCase() === word.toLowerCase()) ?? null}
          word={word}
          language={part.language}
          voiceId={voiceId}
          onDone={onClose}
        />
      ) : null}

      {mode === 'add' ? (
        <View className="gap-3">
          <TextInput
            value={added}
            onChangeText={setAdded}
            multiline
            textAlignVertical="top"
            autoFocus
            placeholder="What should be said next?"
            placeholderTextColor={t.muted}
            accessibilityLabel="New part"
            className={`${fieldClass} max-h-[240px] min-h-[120px]`}
          />
          <InlineAlert message={error} />
          <PrimaryButton
            label="Add part"
            isLoading={parts.insert.isPending}
            isDisabled={!added.trim()}
            onPress={() => parts.insert.mutate({ after: part.index, text: added.trim() }, { onSuccess: onClose, onError: fail })}
          />
          {added.trim() ? (
            <Text variant="caption" className="text-center">It&apos;s voiced when you play or export it ({costLabel(secondsToSay(added, part.language), free)}).</Text>
          ) : null}
        </View>
      ) : null}

      {mode === 'delete' ? (
        <View className="gap-3">
          <Text className="text-[15px] leading-[23px] text-muted">
            {onlyPart ? 'This is the only part. Edit it instead, or delete the whole script.' : 'The parts after it move up. Nothing else is voiced again.'}
          </Text>
          <InlineAlert message={error} />
          <Pressable
            onPress={() => parts.remove.mutate(part.index, { onSuccess: onClose, onError: fail })}
            disabled={parts.remove.isPending || onlyPart}
            accessibilityRole="button"
            className="h-14 flex-row items-center justify-center rounded-full bg-danger active:opacity-85"
          >
            <Text className="text-[16px] font-semibold text-danger-foreground">{parts.remove.isPending ? 'Deleting…' : 'Delete part'}</Text>
          </Pressable>
          <PrimaryButton label="Keep it" variant="secondary" onPress={() => setMode('part')} />
        </View>
      ) : null}

      {mode !== 'part' && mode !== 'delete' ? (
        <Pressable onPress={() => setMode('part')} accessibilityRole="button" className="mt-1 self-center rounded-full px-3 py-1.5 active:bg-default">
          <Text className="text-[14px] font-medium text-accent">Back to the part</Text>
        </Pressable>
      ) : null}
    </ActionSheet>
  );
}

/** A small setting on a part: its voice, its pause, its lock */
function Pill({ icon, label, detail, active, disabled, onPress }: { icon: ReactNode; label: string; detail?: string; active?: boolean; disabled?: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 active:opacity-80 ${active ? 'bg-accent-soft-bg' : 'bg-surface-secondary'} ${disabled ? 'opacity-50' : ''}`}
    >
      {icon}
      <Text className={`text-[13px] font-semibold ${active ? 'text-accent-soft-fg' : ''}`}>{label}</Text>
      {detail ? <Text className="text-[12px] text-muted">{detail}</Text> : null}
      {!active && !disabled ? <ChevronDown size={12} color={t.muted} /> : null}
    </Pressable>
  );
}
