import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './text';

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

const OPEN = { duration: 320, easing: Easing.bezier(0.22, 1, 0.36, 1) };
const SHUT = { duration: 200, easing: Easing.in(Easing.quad) };
// Dragged down this share of its height, or flicked this fast, and it closes
const DRAG_TO_CLOSE = 0.28;
const FLICK_TO_CLOSE = 900;

/**
 * Bottom sheet for short lists of actions or small forms. It rises over a
 * backdrop that fades in, can be dragged down by its top to close, and moves up
 * with the keyboard so whatever is being typed stays in view.
 */
export function ActionSheet({ visible, onClose, title, children }: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const screen = useWindowDimensions().height;
  // It stays up while it slides away, showing what it held when it closed
  const [mounted, setMounted] = useState(visible);
  const [kept, setKept] = useState({ title, children });
  if (visible && !mounted) setMounted(true);
  if (visible && (kept.children !== children || kept.title !== title)) setKept({ title, children });
  const shown = visible ? { title, children } : kept;

  /** 0 is away, 1 is open */
  const open = useSharedValue(0);
  const dragged = useSharedValue(0);
  const height = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      dragged.set(0);
      open.set(still ? 1 : withTiming(1, OPEN));
    } else {
      open.set(
        withTiming(0, still ? { duration: 0 } : SHUT, (finished) => {
          if (finished) runOnJS(setMounted)(false);
        }),
      );
    }
  }, [visible, open, dragged, still]);

  const sheet = useAnimatedStyle(() => ({
    // Off the screen until its height is known, then rising from just below it
    transform: [{ translateY: height.value ? (1 - open.value) * (height.value + 24) + dragged.value : screen }],
  }));
  const backdrop = useAnimatedStyle(() => ({
    opacity: open.value * (1 - Math.min(dragged.value / Math.max(height.value, 1), 1) * 0.7),
  }));

  // Its top (the handle and title) can be dragged down; the content keeps its own scrolling
  const drag = Gesture.Pan()
    .onChange((e) => {
      dragged.set(Math.max(dragged.get() + e.changeY, 0));
    })
    .onEnd((e) => {
      if (dragged.get() > height.get() * DRAG_TO_CLOSE || e.velocityY > FLICK_TO_CLOSE) runOnJS(onClose)();
      else dragged.set(withTiming(0, { duration: 180 }));
    });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
        <KeyboardAvoidingView behavior="padding" style={styles.fill}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Close" />
          <Animated.View
            onLayout={(e) => {
              height.set(e.nativeEvent.layout.height);
            }}
            className="gap-2 rounded-t-[28px] bg-surface px-5 dark:border dark:border-border"
            style={[{ paddingBottom: insets.bottom + 16, boxShadow: '0px -10px 40px rgba(27, 28, 46, 0.15)' }, sheet]}
          >
            <GestureDetector gesture={drag}>
              <View className="pt-3" accessibilityHint="Drag down to close">
                <View className="mb-2 h-1.5 w-10 self-center rounded-full bg-separator" />
                {shown.title ? (
                  <Text variant="title" className="mb-1 mt-2" numberOfLines={2}>
                    {shown.title}
                  </Text>
                ) : null}
              </View>
            </GestureDetector>
            {shown.children}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(16, 17, 42, 0.38)' },
});

interface SheetActionProps {
  icon: ReactNode;
  label: string;
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function SheetAction({ icon, label, detail, onPress, destructive, disabled }: SheetActionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`flex-row items-center gap-3.5 rounded-2xl px-2 py-3.5 active:bg-default ${disabled ? 'opacity-50' : ''}`}
    >
      <View className="w-6 items-center">{icon}</View>
      <View className="flex-1">
        <Text className={`text-[16px] font-medium ${destructive ? 'text-danger' : ''}`}>{label}</Text>
        {detail ? <Text variant="caption">{detail}</Text> : null}
      </View>
    </Pressable>
  );
}
