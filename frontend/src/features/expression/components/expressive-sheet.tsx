import { router } from 'expo-router';
import { Info, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { usePlayerStore } from '@/features/player/store/player.store';
import { useUsage } from '@/features/voices/hooks/use-voices';
import { useTokens } from '@/lib/use-tokens';

import { NARRATION_STRENGTHS, NARRATION_STYLES, narrationStyleMeta, type NarrationStrength, type NarrationStyleId } from '../catalog';
import { useAutoExpression } from '../hooks/use-auto-expression';
import { Chip, Segmented } from './controls';

/**
 * "Make it expressive": pick the story's style (or let AI detect it) and how
 * strong the emotions are; AI then directs every line ahead. Plus and Pro.
 */
export function ExpressiveSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <ActionSheet visible={visible} onClose={onClose} title="Make it expressive">
      {visible ? <Body onClose={onClose} /> : null}
    </ActionSheet>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const t = useTokens();
  const auto = useAutoExpression();
  const narration = usePlayerStore((s) => s.document?.narration);
  const expressive = usePlayerStore((s) => {
    const chunk = s.chunks[s.chunkIndex];
    return chunk ? s.expressive[chunk.language] : true;
  });
  const plan = useUsage().data?.plan.id;
  const [style, setStyle] = useState<NarrationStyleId | 'auto'>(narration?.style ?? 'auto');
  const [strength, setStrength] = useState<NarrationStrength>(narration?.strength ?? 'balanced');

  if (plan === 'free') {
    return (
      <View className="items-center gap-4 pb-2">
        <View className="size-14 items-center justify-center rounded-full bg-accent-soft-bg">
          <Sparkles size={26} color={t.accent} />
        </View>
        <Text variant="title" className="text-center">Let AI direct your story</Text>
        <Text variant="lead" className="text-center">
          With Plus, AI reads ahead, finds the mood and the characters, and gives every line the feeling it needs. You can still add emotions yourself on Free.
        </Text>
        <PrimaryButton
          label="See Plus"
          onPress={() => {
            onClose();
            router.push('/plans');
          }}
        />
      </View>
    );
  }

  const detected = style === 'auto' && narration?.style === 'auto' && narration.detected ? narrationStyleMeta[narration.detected] : null;
  const go = async () => {
    if (await auto.start({ style, strength })) onClose();
  };

  return (
    <View className="gap-5">
      <Text variant="lead">AI reads the story, finds its mood and characters, and directs every line. Your own emotions stay as they are.</Text>

      <View className="gap-2">
        <Text variant="label" className="text-muted">Style</Text>
        <View className="flex-row flex-wrap gap-2">
          <Chip emoji="✨" label="Auto-detect" active={style === 'auto'} onPress={() => setStyle('auto')} />
          {NARRATION_STYLES.map((s) => (
            <Chip key={s.id} emoji={s.emoji} label={s.label} active={style === s.id} onPress={() => setStyle(s.id)} />
          ))}
        </View>
        {detected ? <Text variant="caption">Detected: {detected.emoji} {detected.label}</Text> : null}
      </View>

      <View className="gap-2">
        <Text variant="label" className="text-muted">Strength</Text>
        <Segmented options={NARRATION_STRENGTHS} value={strength} onChange={setStrength} />
      </View>

      {!expressive ? (
        <View className="flex-row gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3">
          <Info size={18} color="#d97706" style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[14px] leading-[20px] text-amber-700 dark:text-amber-300">
            Your current voice reads without emotions. Switch to an HD voice, like Nova or Atlas, to hear the style.
          </Text>
        </View>
      ) : null}

      <View className="gap-2">
        <PrimaryButton
          label={auto.running ? 'Directing…' : narration?.style ? 'Direct again' : 'Make it expressive'}
          icon={<Sparkles size={18} color={t.accentForeground} />}
          isLoading={auto.busy}
          isDisabled={auto.running}
          onPress={() => void go()}
        />
        {narration?.style ? (
          <Pressable
            onPress={() => void auto.setNarration({ style: null, strength }).then((ok) => ok && onClose())}
            disabled={auto.busy}
            accessibilityRole="button"
            className="items-center rounded-full py-2 active:opacity-60"
          >
            <Text className="text-[14px] font-semibold text-muted">Turn the style off</Text>
          </Pressable>
        ) : null}
        <Text variant="caption" className="text-center">Directs as far as your HD minutes reach, from where you are.</Text>
      </View>
    </View>
  );
}
