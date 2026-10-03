import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { cardShadow } from '@/lib/use-tokens';

interface GlassCardProps {
  children?: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Lifts the card with the soft shadow; reserve for the one hero element on a screen */
  raised?: boolean;
}

/** Plain white surface with a large radius; flat unless `raised` */
export function GlassCard({ children, className, style, onPress, accessibilityLabel, raised }: GlassCardProps) {
  const base = `rounded-3xl bg-surface dark:border dark:border-border ${className ?? ''}`;
  const shadow = raised ? { boxShadow: cardShadow } : undefined;

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} className={`${base} active:opacity-90`} style={[shadow, style]}>
        {children}
      </Pressable>
    );
  }

  return (
    <View className={base} style={[shadow, style]}>
      {children}
    </View>
  );
}
