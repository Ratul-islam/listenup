import { Pause, Play } from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

/** Play turning into pause and back: one shrinks away as the other grows in, instead of swapping in a blink */
export function PlayPauseIcon({ playing, size, color }: { playing: boolean; size: number; color: string }) {
  const still = useReducedMotion();
  const at = useSharedValue(playing ? 1 : 0);
  useEffect(() => {
    at.set(still ? (playing ? 1 : 0) : withTiming(playing ? 1 : 0, { duration: 180 }));
  }, [playing, at, still]);
  const play = useAnimatedStyle(() => ({ opacity: 1 - at.value, transform: [{ scale: 1 - 0.4 * at.value }] }));
  const pause = useAnimatedStyle(() => ({ opacity: at.value, transform: [{ scale: 0.6 + 0.4 * at.value }] }));
  return (
    <View style={{ width: size, height: size }}>
      {/* The triangle sits a touch right of centre, where it looks centred */}
      <Animated.View style={[{ position: 'absolute', left: size * 0.08 }, play]}>
        <Play size={size} color={color} fill={color} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute' }, pause]}>
        <Pause size={size} color={color} fill={color} />
      </Animated.View>
    </View>
  );
}
