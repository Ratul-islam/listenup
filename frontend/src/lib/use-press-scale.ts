import { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

/**
 * Press feedback for a button that matters: it gives a little under the finger
 * and springs back. Put `style` on an Animated.View around the button, and the
 * two handlers on the button itself.
 */
export function usePressScale(to = 0.94) {
  const still = useReducedMotion();
  const pressed = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - (1 - to) * pressed.value }] }));
  return {
    style,
    onPressIn: () => {
      if (!still) pressed.set(withTiming(1, { duration: 90 }));
    },
    onPressOut: () => {
      pressed.set(withSpring(0, { damping: 13, stiffness: 300 }));
    },
  };
}
