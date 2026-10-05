import { useToast } from 'heroui-native';
import { ChevronDown, Info, MessageSquareQuote, Send, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { shareVoiceNote } from '@/features/voice-notes/voice-note';
import { useVoice } from '@/features/voices/hooks/use-voices';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { expressionsApi } from '../api/expressions.api';
import { EMOTIONS, SOUNDS, tint, type EmotionId, type SoundId } from '../catalog';
import { applyEmotion } from '../lib/apply';
import { markOf, setSound, soundAt, type Range } from '../lib/marks';
import { Chip } from './controls';

export interface ExpressionTarget {
  chunkIndex: number;
  sentenceIndex: number;
  /** Words chosen in the transcript; the whole line when left out */
  range?: Range;
}

interface ExpressionSheetProps {
  target: ExpressionTarget | null;
  /** `applied` is true when the line is being re-voiced and played */
  onClose: (applied: boolean) => void;
  /** "Say it in your own words" for the same words */
  onDescribe: (target: { chunkIndex: number } & Range) => void;
}

/** "How should this sound?": every emotion, how strong, a sound before it, or your own words */
export function ExpressionSheet({ target, onClose, onDescribe }: ExpressionSheetProps) {
  return (
    <ActionSheet visible={!!target} onClose={() => onClose(false)} title="How should this sound?">
      {target ? <Editor key={`${target.chunkIndex}:${target.sentenceIndex}:${target.range?.start}`} target={target} onClose={onClose} onDescribe={onDescribe} /> : null}
    </ActionSheet>
  );
}

function Editor({ target, onClose, onDescribe }: { target: ExpressionTarget; onClose: (applied: boolean) => void; onDescribe: ExpressionSheetProps['onDescribe'] }) {
  const t = useTokens();
  const documentId = usePlayerStore((s) => s.documentId);
  const chunk = usePlayerStore((s) => s.chunks[target.chunkIndex]);
  const expressive = usePlayerStore((s) => (chunk ? s.expressive[chunk.language] : true));
  const voiceId = usePlayerStore((s) => (chunk ? s.voices[chunk.language] : null));
  const tier = usePlayerStore((s) => (chunk ? s.tiers[chunk.language] : 'natural'));
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const voice = useVoice(voiceId);

  const sentence = chunk?.sentences[target.sentenceIndex];
  const range: Range = target.range ?? (sentence ? { start: sentence.start, end: sentence.end } : { start: 0, end: 0 });
  const current = chunk ? markOf(chunk.expressions, range) : null;

  const [emotion, setEmotionChoice] = useState<EmotionId | null>(current?.emotion ?? null);
  const [strong, setStrong] = useState(!!current?.strong);
  const [direction, setDirection] = useState(current?.direction);
  const [sound, setSoundChoice] = useState<SoundId | null>(() => (chunk ? soundAt(chunk.expressions, range.start) : null));
  const [showSounds, setShowSounds] = useState(sound !== null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!chunk || !sentence || !documentId) return null;

  const changed =
    emotion !== (current?.emotion ?? null) ||
    (!!emotion && strong !== !!current?.strong) ||
    direction !== current?.direction ||
    sound !== soundAt(chunk.expressions, range.start);

  const apply = async () => {
    setSaving(true);
    setError(null);
    try {
      // Sounds first, so the emotion's save carries them
      if (sound !== soundAt(chunk.expressions, range.start)) {
        const withSound = setSound(chunk.expressions, range.start, sound);
        audioEngine.setExpressions(chunk.index, await expressionsApi.setChunk(documentId, chunk.index, withSound));
      }
      await applyEmotion(chunk.index, range, emotion, { strong: !!emotion && strong, direction: emotion ? direction : undefined, replay: true });
      haptics.success();
      onClose(true);
    } catch (e) {
      haptics.error();
      setError(getErrorMessage(e));
      setSaving(false);
    }
  };

  const selected = chunk.text.slice(range.start, range.end);
  const partial = range.start !== sentence.start || range.end !== sentence.end;

  // The paragraph around this line, within the part of the document that's loaded
  const paragraph: Range = (() => {
    let first = target.sentenceIndex;
    while (first > 0 && !chunk.sentences[first].paragraphStart) first--;
    let last = target.sentenceIndex;
    while (last + 1 < chunk.sentences.length && !chunk.sentences[last + 1].paragraphStart) last++;
    return { start: chunk.sentences[first].start, end: chunk.sentences[last].end };
  })();
  const paragraphIsLonger = paragraph.start !== range.start || paragraph.end !== range.end;

  const send = async (part: Range) => {
    setSending(true);
    try {
      await shareVoiceNote({ documentId, chunk, range: part, tier, voiceId });
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  const pick = (id: EmotionId | null) => {
    haptics.tap();
    setEmotionChoice(id);
    // A direction describes one emotion; a new choice starts plain
    if (id !== current?.emotion) setDirection(undefined);
    if (!id) setStrong(false);
  };

  return (
    <View className="gap-4">
      <ScrollView style={{ maxHeight: 470 }} contentContainerClassName="gap-4" keyboardShouldPersistTaps="handled">
        <View className="rounded-2xl bg-surface-secondary px-4 py-3">
          <Text className="text-[16px] leading-[24px]" style={emotion ? { backgroundColor: tint(emotion) } : undefined} numberOfLines={5}>
            &ldquo;{selected.trim()}&rdquo;
          </Text>
        </View>

        <Section title={partial ? 'How these words sound' : 'How this line sounds'}>
          <Chip emoji="🙂" label="Normal" active={!emotion} onPress={() => pick(null)} />
          {EMOTIONS.map((e) => (
            <Chip key={e.id} emoji={e.emoji} label={e.label} active={emotion === e.id} color={e.color} onPress={() => pick(emotion === e.id ? null : e.id)} />
          ))}
        </Section>

        {emotion ? (
          <View className="flex-row flex-wrap items-center gap-2">
            <Chip emoji="🔥" label="Stronger" active={strong} onPress={() => (haptics.tap(), setStrong(!strong))} />
            {direction ? (
              <Pressable
                onPress={() => setDirection(undefined)}
                accessibilityRole="button"
                accessibilityLabel={`Directed: ${direction}. Remove the direction`}
                className="flex-row items-center gap-1.5 rounded-full bg-surface-secondary py-2 pl-3 pr-2 active:opacity-70"
              >
                <Text className="text-[13px] text-muted" numberOfLines={1}>&ldquo;{direction}&rdquo;</Text>
                <X size={14} color={t.muted} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onPress={() => onDescribe({ chunkIndex: chunk.index, ...range })}
          accessibilityRole="button"
          className="flex-row items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 active:opacity-70"
        >
          <MessageSquareQuote size={19} color={t.accent} />
          <View className="flex-1">
            <Text className="text-[15px] font-semibold">Say it in your own words</Text>
            <Text variant="caption">“Like a scared little child”, typed or spoken</Text>
          </View>
        </Pressable>

        {showSounds ? (
          <Section title="Sound before it">
            {SOUNDS.map((s) => (
              <Chip key={s.id} emoji={s.emoji} label={s.label} active={sound === s.id} onPress={() => (haptics.tap(), setSoundChoice(sound === s.id ? null : s.id))} />
            ))}
          </Section>
        ) : (
          <Pressable onPress={() => setShowSounds(true)} accessibilityRole="button" className="flex-row items-center gap-1 self-start rounded-full py-1.5 pr-2 active:opacity-60">
            <Text className="text-[14px] font-medium text-accent">Add a sound, like a laugh or a sigh</Text>
            <ChevronDown size={16} color={t.accent} />
          </Pressable>
        )}

        {!expressive ? (
          <View className="flex-row gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3">
            <Info size={18} color="#d97706" style={{ marginTop: 1 }} />
            <Text className="flex-1 text-[14px] leading-[20px] text-amber-700 dark:text-amber-300">
              {voice?.name ?? 'This voice'} reads without emotions. Your choices are saved and play with any HD voice, like Nova or Eleanor.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <InlineAlert message={error} />
      <PrimaryButton
        label={changed ? 'Apply & listen' : 'Choose how it sounds'}
        variant="primary"
        size="md"
        isDisabled={!changed}
        isLoading={saving}
        onPress={() => void apply()}
      />
      <View className="flex-row items-center justify-center gap-1">
        <Send size={15} color={t.accent} />
        <Text variant="caption">Send as a voice note:</Text>
        <Pressable onPress={() => void send(range)} disabled={sending} accessibilityRole="button" className="rounded-full px-2 py-1.5 active:bg-default">
          <Text className="text-[14px] font-semibold text-accent">{partial ? 'these words' : 'this line'}</Text>
        </Pressable>
        {paragraphIsLonger ? (
          <Pressable onPress={() => void send(paragraph)} disabled={sending} accessibilityRole="button" className="rounded-full px-2 py-1.5 active:bg-default">
            <Text className="text-[14px] font-semibold text-accent">paragraph</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text variant="label" className="text-muted" numberOfLines={1}>{title}</Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}
