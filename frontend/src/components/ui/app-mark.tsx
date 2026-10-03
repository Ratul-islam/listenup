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

const BARS = [0.42, 0.78, 1, 0.66, 0.4];

function Bar({ rest, index, active, height }: { rest: number; index: number; active: boolean; height: number }) {
  const scale = useSharedValue(rest);
  useEffect(() => {
    if (active) {
      scale.value = withDelay(
        index * 90,
        withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0.35, { duration: 360 })), -1, true),
      );
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(rest, { duration: 300 });
    }
  }, [active, index, rest, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return (
    <Animated.View
      style={[{ width: height * 0.085, height, borderRadius: height, backgroundColor: '#ffffff' }, style]}
    />
  );
}

interface AppMarkProps {
  size?: number;
  /** Animate the bars, e.g. while a sample is "speaking" */
  active?: boolean;
}

/** ListenUp app icon: glossy indigo squircle with a waveform */
export function AppMark({ size = 96, active = false }: AppMarkProps) {
  const t = useTokens();
  const reduceMotion = useReducedMotion();
  const barHeight = size * 0.4;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="ListenUp"
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        experimental_backgroundImage: `radial-gradient(circle at 75% 15%, #ffffff40 0%, transparent 35%), linear-gradient(160deg, ${t.periwinkle} 0%, ${t.accent} 100%)`,
        boxShadow: `0px 18px 36px ${t.accent}50, inset 0px 2px 6px #ffffff50`,
      }}
    >
      <View className="flex-row items-center" style={{ gap: size * 0.085, height: barHeight }}>
        {BARS.map((rest, i) => (
          <Bar key={i} rest={rest} index={i} active={active && !reduceMotion} height={barHeight} />
        ))}
      </View>
      <View
        className="absolute rounded-full bg-white/80"
        style={{ width: size * 0.09, height: size * 0.09, top: size * 0.1, right: size * 0.1 }}
      />
    </View>
  );
}
