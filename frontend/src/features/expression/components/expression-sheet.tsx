import { ChevronDown, Mic, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { EMOTIONS, SOUNDS, tint, type EmotionId, type SoundId } from '../catalog';
import { applyEmotion, saveExpressions } from '../lib/apply';
import { markOf, setSound, soundAt, type Range } from '../lib/marks';
import { quoted } from '../lib/quote';
import { Chip } from './controls';
import type { DescribeTarget } from './describe-sheet';
import { PlainVoiceNotice } from './plain-voice-notice';

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
  /** "Say it yourself" or "Describe it" for the same words */
  onDescribe: (target: DescribeTarget) => void;
}

/** "How should this sound?": every emotion, how strong, a sound before it, or your own way of saying it */
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
      if (sound !== soundAt(chunk.expressions, range.start)) await saveExpressions(chunk.index, setSound(chunk.expressions, range.start, sound));
      await applyEmotion(chunk.index, range, emotion, { strong: !!emotion && strong, direction: emotion ? direction : undefined, replay: true });
      haptics.success();
      // A voice that reads plainly has nothing new to play: carry on from where it was paused
      onClose(audioEngine.takesEmotions(chunk.index));
    } catch (e) {
      haptics.error();
      setError(getErrorMessage(e));
      setSaving(false);
    }
  };

  const selected = chunk.text.slice(range.start, range.end);
  const partial = range.start !== sentence.start || range.end !== sentence.end;

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
            {quoted(selected)}
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

        {/* The two ways that aren't a list of feelings, side by side so neither is buried */}
        <View className="flex-row gap-2">
          <OwnWay
            icon={<Mic size={19} color={t.accent} />}
            title="Say it yourself"
            detail="The voice follows you"
            onPress={() => onDescribe({ chunkIndex: chunk.index, ...range, way: 'say' })}
          />
          <OwnWay
            icon={<Text className="text-[17px] leading-5">✍️</Text>}
            title="Describe it"
            detail="“like a scared child”"
            onPress={() => onDescribe({ chunkIndex: chunk.index, ...range, way: 'describe' })}
          />
        </View>

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

        <PlainVoiceNotice chunkIndex={chunk.index} />
      </ScrollView>

      <InlineAlert message={error} />
      <PrimaryButton
        label={changed ? 'Apply and listen' : 'Choose how it sounds'}
        variant="primary"
        size="md"
        isDisabled={!changed}
        isLoading={saving}
        onPress={() => void apply()}
      />
    </View>
  );
}

function OwnWay({ icon, title, detail, onPress }: { icon: ReactNode; title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} className="flex-1 gap-1.5 rounded-2xl bg-accent-soft-bg p-3.5 active:opacity-70">
      {icon}
      <View>
        <Text className="text-[15px] font-semibold">{title}</Text>
        <Text className="text-[12.5px] leading-[17px] text-accent-soft-fg" numberOfLines={1}>{detail}</Text>
      </View>
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
