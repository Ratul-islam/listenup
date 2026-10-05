import { useToast } from 'heroui-native';
import { Mic, WandSparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { usePlayerStore } from '@/features/player/store/player.store';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';
import { phoneVoice } from '@/modules/phone-voice';

import { emotionMeta } from '../catalog';
import { describeRange } from '../lib/apply';
import type { Range } from '../lib/marks';

export interface DescribeTarget extends Range {
  chunkIndex: number;
}

const IDEAS = ['like a scared little child', 'slowly, full of dread', 'trying not to laugh', 'angry but quiet', 'like a proud old king'];

/** "How should it sound?" in the listener's own words, typed or spoken */
export function DescribeSheet({ target, onClose }: { target: DescribeTarget | null; onClose: (applied: boolean) => void }) {
  return (
    <ActionSheet visible={!!target} onClose={() => onClose(false)} title="Say how it should sound">
      {target ? <Body key={`${target.chunkIndex}:${target.start}:${target.end}`} target={target} onClose={onClose} /> : null}
    </ActionSheet>
  );
}

function Body({ target, onClose }: { target: DescribeTarget; onClose: (applied: boolean) => void }) {
  const t = useTokens();
  const { toast } = useToast();
  const text = usePlayerStore((s) => s.chunks[target.chunkIndex]?.text.slice(target.start, target.end) ?? '');
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
      const mark = await describeRange(target.chunkIndex, target, words);
      haptics.success();
      if (mark) toast.show({ label: `${emotionMeta[mark.emotion].emoji} ${mark.direction ?? emotionMeta[mark.emotion].label}`, description: 'Listen to how it sounds now.' });
      onClose(true);
    } catch (e) {
      haptics.error();
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      <View className="rounded-2xl bg-surface-secondary px-4 py-3">
        <Text className="text-[16px] leading-[24px]" numberOfLines={4}>&ldquo;{text.trim()}&rdquo;</Text>
      </View>

      <View className="min-h-12 flex-row items-center gap-2 rounded-2xl bg-surface pl-3.5 pr-1.5 dark:border dark:border-border">
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. whispered, like a secret"
          placeholderTextColor={t.muted}
          returnKeyType="done"
          onSubmitEditing={() => void apply()}
          autoFocus
          multiline
          maxLength={300}
          accessibilityLabel="How it should sound"
          className="flex-1 py-3 font-sans text-[15px] text-foreground"
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
    </View>
  );
}
