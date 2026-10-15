import { router } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { usePlayerStore } from '@/features/player/store/player.store';
import { useUsage } from '@/features/voices/hooks/use-voices';
import { useTokens } from '@/lib/use-tokens';

import { NARRATION_STRENGTHS, NARRATION_STYLES, narrationStyleMeta, type NarrationStrength, type NarrationStyleId } from '../catalog';
import { useAutoExpression } from '../hooks/use-auto-expression';
import { useExpressiveSwitch } from '../hooks/use-expressive-switch';
import { Chip } from './controls';

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
  // A Natural or Phone voice can't play the style: offer the Expressive voice that can, in the same tap
  const { plain, current, suggestion, switching, switchNow } = useExpressiveSwitch();
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
  const go = async (withVoice = false) => {
    if (withVoice) await switchNow();
    if (await auto.start({ style, strength })) onClose();
  };

  return (
    <View className="gap-5">
      <Text variant="lead">AI reads the story, finds its mood, directs the lines, and gives each character their own voice. Your own emotions stay as they are.</Text>

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

      {plain ? (
        <Text variant="caption" className="rounded-2xl bg-accent-soft-bg px-3.5 py-2.5 text-accent-soft-fg">
          {current?.name ?? 'This voice'} reads without emotions, so the style wouldn’t be heard.
          {suggestion ? ` ${suggestion.name} is the closest voice that acts them out.` : ' Choose an Expressive voice to hear it.'}
        </Text>
      ) : null}

      <View className="gap-2">
        <PrimaryButton
          label={auto.running ? 'Directing…' : plain && suggestion ? `Use ${suggestion.name} and make it expressive` : narration?.style ? 'Direct again' : 'Make it expressive'}
          icon={<Sparkles size={18} color={t.accentForeground} />}
          isLoading={auto.busy || switching}
          isDisabled={auto.running}
          onPress={() => void go(plain && !!suggestion)}
        />
        {plain && suggestion ? (
          <Pressable onPress={() => void go()} disabled={auto.busy || auto.running} accessibilityRole="button" className="items-center rounded-full py-2 active:opacity-60">
            <Text className="text-[14px] font-semibold text-muted">Keep {current?.name ?? 'this voice'} and save the directions for later</Text>
          </Pressable>
        ) : null}
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
        <Text variant="caption" className="text-center">Directs as far as your Expressive minutes reach, from where you are.</Text>
      </View>
    </View>
  );
}
