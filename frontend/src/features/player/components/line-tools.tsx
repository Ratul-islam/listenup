import { Mic, MoreHorizontal, Play, Smile } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { emotionMeta, type EmotionId } from '@/features/expression/catalog';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

export type LineAction = 'play' | 'feeling' | 'say' | 'more';

function Tool({ label, hint, primary, onPress, children }: { label: string; hint: string; primary?: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={hint}
      className={`h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-full active:opacity-80 ${primary ? 'bg-accent' : 'bg-surface dark:border dark:border-border'}`}
    >
      {children}
      <Text className={`text-[14px] font-semibold ${primary ? 'text-accent-foreground' : 'text-foreground'}`} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/**
 * What can be done with the line that was tapped, right under it: hear it
 * from here, give it a feeling, say it yourself, and the rest under ⋯.
 */
export function LineTools({ feeling, onAction }: { feeling?: EmotionId; onAction: (action: LineAction) => void }) {
  const t = useTokens();
  return (
    <Animated.View entering={FadeInUp.duration(200)} className="flex-row items-center gap-1.5 pb-1 pt-3.5">
      <Tool label="Play" hint="Play from this line" primary onPress={() => onAction('play')}>
        <Play size={14} color={t.accentForeground} fill={t.accentForeground} />
      </Tool>
      <Tool label="Feeling" hint={feeling ? `This line sounds ${emotionMeta[feeling].label.toLowerCase()}. Change how it sounds` : 'Choose how this line sounds'} onPress={() => onAction('feeling')}>
        {feeling ? <Text className="text-[15px] leading-5">{emotionMeta[feeling].emoji}</Text> : <Smile size={16} color={t.accent} />}
      </Tool>
      <Tool label="Say it" hint="Say this line yourself, and the voice follows you" onPress={() => onAction('say')}>
        <Mic size={16} color={t.accent} />
      </Tool>
      <Pressable
        onPress={() => {
          haptics.tap();
          onAction('more');
        }}
        accessibilityRole="button"
        accessibilityLabel="More for this line"
        className="size-11 items-center justify-center rounded-full bg-surface active:opacity-80 dark:border dark:border-border"
      >
        <MoreHorizontal size={18} color={t.foreground} />
      </Pressable>
    </Animated.View>
  );
}
