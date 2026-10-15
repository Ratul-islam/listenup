import { File } from 'expo-file-system';
import { useToast } from 'heroui-native';
import { AudioLines, Mic, WandSparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { TakeRecorder, type Take } from '@/features/own-voice/components/take-recorder';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';
import { phoneVoice } from '@/modules/phone-voice';

import { emotionMeta, type EmotionMark } from '../catalog';
import { describeRange, followRecording } from '../lib/apply';
import type { Range } from '../lib/marks';
import { quoted } from '../lib/quote';

type Way = 'describe' | 'say';

export interface DescribeTarget extends Range {
  chunkIndex: number;
  /** The way the sheet opens on; describing it in words when left out */
  way?: Way;
}

const WAYS: { id: Way; label: string }[] = [
  { id: 'say', label: 'Say it yourself' },
  { id: 'describe', label: 'Describe it' },
];

const IDEAS = ['like a scared little child', 'slowly, full of dread', 'trying not to laugh', 'angry but quiet', 'like a proud old king'];

// A recording of the words: at least this long, and no longer than reading them slowly takes
const MIN_SAY_SEC = 1;
const MAX_SAY_SEC = 45;
const sayLimit = (text: string) => Math.min(MAX_SAY_SEC, Math.max(8, Math.ceil(text.length / 8) + 6));

/** "How should it sound?" in the listener's own words (typed or spoken), or by saying the line themselves */
export function DescribeSheet({ target, onClose }: { target: DescribeTarget | null; onClose: (applied: boolean) => void }) {
  return (
    <ActionSheet visible={!!target} onClose={() => onClose(false)} title="Say how it should sound">
      {target ? <Body key={`${target.chunkIndex}:${target.start}:${target.end}:${target.way}`} target={target} onClose={onClose} /> : null}
    </ActionSheet>
  );
}

function Body({ target, onClose }: { target: DescribeTarget; onClose: (applied: boolean) => void }) {
  const { toast } = useToast();
  const text = usePlayerStore((s) => s.chunks[target.chunkIndex]?.text.slice(target.start, target.end) ?? '');
  const [way, setWay] = useState<Way>(target.way ?? 'describe');

  /**
   * The line has its direction: say what it is, and close (replaying when the voice can act it).
   * `shaped` is how a recording was taken: true when the voice follows its timing and tune, false when
   * it was too faint to follow and only a description of it is used.
   */
  const directed = (mark: EmotionMark | null | undefined, pauses = 0, shaped?: boolean) => {
    haptics.success();
    // A voice that reads plainly has nothing new to play: carry on from where it was paused
    const replaying = audioEngine.takesEmotions(target.chunkIndex);
    if (mark) {
      const heard = `${emotionMeta[mark.emotion].emoji} ${mark.direction ?? emotionMeta[mark.emotion].label}`;
      const label = shaped ? `${heard}, with your timing and tune` : pauses ? `${heard}, with ${pauses === 1 ? 'your pause' : 'your pauses'}` : heard;
      const faint = shaped === false ? 'The recording was too faint to follow closely. ' : '';
      toast.show({ label, description: `${faint}${replaying ? 'Listen to how it sounds now.' : 'Saved for an Expressive voice.'}` });
    }
    onClose(replaying);
  };

  return (
    <View className="gap-4">
      <View className="rounded-2xl bg-surface-secondary px-4 py-3">
        <Text className="text-[16px] leading-[24px]" numberOfLines={4}>{quoted(text)}</Text>
      </View>
      <Segmented options={WAYS} value={way} onChange={setWay} />
      {way === 'describe' ? <Describe target={target} onDirected={directed} /> : <SayIt target={target} text={text} onDirected={directed} />}
    </View>
  );
}

interface WayProps {
  target: DescribeTarget;
  onDirected: (mark: EmotionMark | null | undefined, pauses?: number, shaped?: boolean) => void;
}

function Describe({ target, onDirected }: WayProps) {
  const t = useTokens();
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listen = async () => {
    try {
      const heard = await phoneVoice.recognize({ prompt: 'How should it sound?' });
      if (heard) setDescription(heard);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const apply = async (words = description) => {
    if (words.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      onDirected(await describeRange(target.chunkIndex, target, words));
    } catch (e) {
      haptics.error();
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <>
      {/* A bordered field: on the sheet's own white it would otherwise have no edge to show where to type */}
      <View className="min-h-[52px] flex-row items-center gap-2 rounded-2xl border border-field-border bg-field pl-4 pr-1.5">
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. whispered, like a secret"
          placeholderTextColor={t.muted}
          returnKeyType="done"
          // It can run to a second line, but Done sends it rather than starting a new one
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => void apply()}
          autoFocus
          multiline
          maxLength={300}
          accessibilityLabel="How it should sound"
          className="flex-1 py-3 font-sans text-[16px] text-foreground"
        />
        {phoneVoice.isAvailable ? (
          <Pressable onPress={() => void listen()} hitSlop={8} accessibilityLabel="Say it instead of typing" className="size-10 items-center justify-center rounded-full active:bg-default">
            <Mic size={19} color={t.accent} />
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row flex-wrap gap-2">
        {IDEAS.map((idea) => (
          <Pressable
            key={idea}
            onPress={() => {
              haptics.tap();
              setDescription(idea);
            }}
            accessibilityRole="button"
            className="rounded-full bg-surface-secondary px-3 py-1.5 active:opacity-70"
          >
            <Text className="text-[13px] font-medium text-muted">{idea}</Text>
          </Pressable>
        ))}
      </View>

      <InlineAlert message={error} />
      <PrimaryButton
        label="Direct it"
        icon={<WandSparkles size={18} color={t.accentForeground} />}
        isLoading={busy}
        isDisabled={description.trim().length < 2}
        onPress={() => void apply()}
      />
    </>
  );
}

/**
 * The listener says the words the way they want to hear them. The server
 * measures the recording (when each sound is said, the stops, the rise and
 * fall of the voice, the stress) and shapes the story's voice to it, and AI
 * listens once for the feeling. The recording itself isn't kept.
 */
function SayIt({ target, text, onDirected }: WayProps & { text: string }) {
  const t = useTokens();
  const [take, setTake] = useState<Take | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    if (!take) return;
    setBusy(true);
    setError(null);
    try {
      const followed = await followRecording(target.chunkIndex, target, await new File(take.uri).base64());
      onDirected(followed?.mark, followed?.pauses, followed?.shaped);
    } catch (e) {
      haptics.error();
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <>
      <Text variant="caption" className="text-center">
        Say these words the way you want to hear them. The voice follows your timing, your pauses and the rise and fall of your voice.
      </Text>
      <TakeRecorder
        take={take}
        onTake={(next) => {
          setError(null);
          setTake(next);
        }}
        minSec={MIN_SAY_SEC}
        maxSec={sayLimit(text)}
        labels={{ idle: 'Tap, then say it your way', taken: 'Listen back, or record it again.', tooShort: 'Say the whole line, then tap to stop.' }}
      />
      <Text variant="caption" className="text-center">Your recording isn’t kept. Only how you said it is saved, as numbers.</Text>

      <InlineAlert message={error} />
      <PrimaryButton
        label="Say it like this"
        icon={<AudioLines size={18} color={t.accentForeground} />}
        isLoading={busy}
        isDisabled={!take}
        onPress={() => void apply()}
      />
    </>
  );
}
