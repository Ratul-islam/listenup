import { ChevronDown, Info } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { useVoice } from '@/features/voices/hooks/use-voices';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { expressionsApi } from '../api/expressions.api';
import { EMOTIONS, SOUNDS, tint, type EmotionId, type SoundId } from '../catalog';
import { emotionOf, setEmotion, setSound, soundAt, wordsOf, type Range } from '../lib/marks';

export interface ExpressionTarget {
  chunkIndex: number;
  sentenceIndex: number;
}

interface ExpressionSheetProps {
  target: ExpressionTarget | null;
  /** `applied` is true when the line is being re-voiced and played */
  onClose: (applied: boolean) => void;
}

/** "How should this sound?": pick an emotion (and optionally a sound) for a line or a few of its words */
export function ExpressionSheet({ target, onClose }: ExpressionSheetProps) {
  return (
    <ActionSheet visible={!!target} onClose={() => onClose(false)} title="How should this sound?">
      {target ? <Editor key={`${target.chunkIndex}:${target.sentenceIndex}`} target={target} onClose={onClose} /> : null}
    </ActionSheet>
  );
}

function Editor({ target, onClose }: { target: ExpressionTarget; onClose: (applied: boolean) => void }) {
  const t = useTokens();
  const documentId = usePlayerStore((s) => s.documentId);
  const chunk = usePlayerStore((s) => s.chunks[target.chunkIndex]);
  const expressive = usePlayerStore((s) => (chunk ? s.expressive[chunk.language] : true));
  const voiceId = usePlayerStore((s) => (chunk ? s.voices[chunk.language] : null));
  const voice = useVoice(voiceId);

  const sentence = chunk?.sentences[target.sentenceIndex];
  const line: Range = sentence ? { start: sentence.start, end: sentence.end } : { start: 0, end: 0 };
  const words = chunk ? wordsOf(chunk.text, line) : [];

  const [range, setRange] = useState<Range>(line);
  const [picking, setPicking] = useState(false);
  // First word tapped while picking; the next tap selects everything between
  const [anchor, setAnchor] = useState<number | null>(null);
  const [emotion, setEmotionChoice] = useState<EmotionId | null>(() => (chunk ? emotionOf(chunk.expressions, line) : null));
  const [sound, setSoundChoice] = useState<SoundId | null>(() => (chunk ? soundAt(chunk.expressions, line.start) : null));
  const [showSounds, setShowSounds] = useState(sound !== null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!chunk || !sentence || !documentId) return null;

  const select = (next: Range) => {
    setRange(next);
    setEmotionChoice(emotionOf(chunk.expressions, next));
    setSoundChoice(soundAt(chunk.expressions, next.start));
  };

  const tapWord = (i: number) => {
    haptics.tap();
    if (anchor === null) {
      setAnchor(i);
      select(words[i]);
    } else {
      select({ start: words[Math.min(anchor, i)].start, end: words[Math.max(anchor, i)].end });
      setAnchor(null);
    }
  };

  const changed = emotion !== emotionOf(chunk.expressions, range) || sound !== soundAt(chunk.expressions, range.start);

  const apply = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = setSound(setEmotion(chunk.text, chunk.expressions, range, emotion), range.start, sound);
      const saved = await expressionsApi.setChunk(documentId, chunk.index, next);
      audioEngine.setExpressions(chunk.index, saved);
      haptics.success();
      onClose(true);
      void audioEngine.replayFrom(chunk.index, range.start);
    } catch (e) {
      haptics.error();
      setError(getErrorMessage(e));
      setSaving(false);
    }
  };

  const selected = chunk.text.slice(range.start, range.end);
  const partial = range.start !== line.start || range.end !== line.end;

  return (
    <View className="gap-4">
      <ScrollView style={{ maxHeight: 470 }} contentContainerClassName="gap-4" keyboardShouldPersistTaps="handled">
        <View className="flex-row rounded-full bg-surface-secondary p-1">
          <Segment
            label="Whole line"
            active={!picking}
            onPress={() => {
              setPicking(false);
              setAnchor(null);
              select(line);
            }}
          />
          <Segment label="Pick words" active={picking} onPress={() => setPicking(true)} />
        </View>

        {picking ? (
          <View className="gap-2">
            <View className="flex-row flex-wrap gap-1.5">
              {words.map((w, i) => {
                const on = w.start >= range.start && w.end <= range.end;
                return (
                  <Pressable
                    key={w.start}
                    onPress={() => tapWord(i)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    className={`rounded-xl px-2.5 py-1.5 ${on ? 'bg-accent-soft-bg' : 'bg-surface-secondary'}`}
                  >
                    <Text className={`text-[15px] ${on ? 'font-semibold text-accent-soft-fg' : ''}`}>{chunk.text.slice(w.start, w.end)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text variant="caption">
              {anchor === null ? 'Tap a word. To select a few, tap the first word, then the last.' : 'Now tap the last word, or choose an emotion for this one.'}
            </Text>
          </View>
        ) : (
          <View className="rounded-2xl bg-surface-secondary px-4 py-3">
            <Text
              className="text-[16px] leading-[24px]"
              style={emotion ? { backgroundColor: tint(emotion) } : undefined}
              numberOfLines={5}
            >
              &ldquo;{selected}&rdquo;
            </Text>
          </View>
        )}

        <Section title={partial ? `How “${selected}” sounds` : 'How this line sounds'}>
          <Chip
            emoji="🙂"
            label="Normal"
            active={!emotion}
            onPress={() => {
              haptics.tap();
              setEmotionChoice(null);
            }}
          />
          {EMOTIONS.map((e) => (
            <Chip
              key={e.id}
              emoji={e.emoji}
              label={e.label}
              active={emotion === e.id}
              color={e.color}
              onPress={() => {
                haptics.tap();
                setEmotionChoice(emotion === e.id ? null : e.id);
              }}
            />
          ))}
        </Section>

        {showSounds ? (
          <Section title="Sound before it">
            {SOUNDS.map((s) => (
              <Chip
                key={s.id}
                emoji={s.emoji}
                label={s.label}
                active={sound === s.id}
                onPress={() => {
                  haptics.tap();
                  setSoundChoice(sound === s.id ? null : s.id);
                }}
              />
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
        label={changed ? 'Apply & listen' : 'Choose an emotion or sound'}
        variant="primary"
        size="md"
        isDisabled={!changed}
        isLoading={saving}
        onPress={() => void apply()}
      />
    </View>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      className={`flex-1 items-center rounded-full py-2 ${active ? 'bg-surface' : ''}`}
      style={active ? { boxShadow: '0px 2px 8px rgba(80, 99, 184, 0.12)' } : undefined}
    >
      <Text className={`text-[14px] font-semibold ${active ? 'text-accent' : 'text-muted'}`}>{label}</Text>
    </Pressable>
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

function Chip({ emoji, label, active, color, onPress }: { emoji: string; label: string; active: boolean; color?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 active:opacity-70 ${active ? 'bg-accent-soft-bg' : 'bg-surface-secondary'}`}
      style={active && color ? { backgroundColor: `${color}2e` } : undefined}
    >
      <Text className="text-[17px] leading-[22px]">{emoji}</Text>
      <Text className={`text-[14px] font-semibold ${active ? 'text-foreground' : 'text-muted'}`}>{label}</Text>
    </Pressable>
  );
}
