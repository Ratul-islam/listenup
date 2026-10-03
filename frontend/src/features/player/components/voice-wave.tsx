import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTokens } from '@/lib/use-tokens';

// Symmetric silhouette from the player design
const HEIGHTS = [0.18, 0.3, 0.42, 0.58, 0.82, 0.92, 1, 0.92, 0.82, 0.38, 0.5, 0.36, 0.22, 0.14];
const MAX = 56;

function Bar({ index, rest, active, color }: { index: number; rest: number; active: boolean; color: string }) {
  const scale = useSharedValue(rest);
  useEffect(() => {
    if (active) {
      const low = rest * 0.45;
      scale.value = withDelay(
        (index * 53) % 400,
        withRepeat(withSequence(withTiming(Math.min(rest * 1.15, 1), { duration: 280 + (index % 4) * 60 }), withTiming(low, { duration: 320 })), -1, true),
      );
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(rest * 0.35, { duration: 400 });
    }
  }, [active, index, rest, scale]);
  const style = useAnimatedStyle(() => ({ height: Math.max(scale.value * MAX, 4) }));
  return (
    <Animated.View
      style={[
        { width: 4, borderRadius: 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

/** Small violet waveform; moves while speech is playing and settles when paused */
export function VoiceWave({ active }: { active: boolean }) {
  const t = useTokens();
  const reduceMotion = useReducedMotion();

  return (
    <View className="flex-row items-center justify-center gap-1.5" style={{ height: MAX }} accessibilityElementsHidden>
      {HEIGHTS.map((h, i) => (
        <Bar key={i} index={i} rest={h} active={active && !reduceMotion} color={t.accent} />
      ))}
    </View>
  );
}
