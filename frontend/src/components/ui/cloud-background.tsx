import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTokens } from '@/lib/use-tokens';

interface CloudBackgroundProps {
  children?: ReactNode;
  style?: ViewStyle;
}

/** Soft lavender wash with one faint glow at the top; quiet enough to sit behind any content */
export function CloudBackground({ children, style }: CloudBackgroundProps) {
  const t = useTokens();

  return (
    <View style={[{ flex: 1, backgroundColor: t.background }, style]}>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: [
              `radial-gradient(circle at 85% 0%, ${t.glowPink} 0%, transparent 40%)`,
              `linear-gradient(180deg, ${t.cloudTop} 0%, ${t.cloudMid} 40%, ${t.cloudBottom} 100%)`,
            ].join(', '),
          },
        ]}
      />
      {children}
    </View>
  );
}
