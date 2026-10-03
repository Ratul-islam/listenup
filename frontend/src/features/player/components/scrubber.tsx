import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Text } from '@/components/ui/text';

import { audioEngine } from '../engine/audio-engine';
import { formatClock, usePlayerTimeline } from '../hooks/use-player';

/** Draggable progress bar with elapsed and remaining time */
export function Scrubber() {
  const { positionMs, totalMs, speed } = usePlayerTimeline();
  const [width, setWidth] = useState(1);
  const [dragMs, setDragMs] = useState<number | null>(null);

  const shown = dragMs ?? positionMs;
  const fraction = totalMs ? Math.min(shown / totalMs, 1) : 0;

  const toMs = (x: number) => Math.max(0, Math.min(x / width, 1)) * totalMs;
  const commit = (x: number) => {
    setDragMs(null);
    void audioEngine.seek(toMs(x));
  };

  // Callbacks touch React state, so run them on the JS thread
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => setDragMs(toMs(e.x)))
    .onUpdate((e) => setDragMs(toMs(e.x)))
    .onEnd((e) => commit(e.x))
    .onFinalize((_, success) => {
      if (!success) setDragMs(null);
    });

  return (
    <View className="gap-1">
      <GestureDetector gesture={pan}>
        <View
          className="h-8 justify-center"
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel="Playback position"
          accessibilityValue={{ text: `${formatClock(shown)} of ${formatClock(totalMs)}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => audioEngine.skip(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        >
          <View className="h-1 w-full overflow-hidden rounded-full bg-surface-tertiary">
            <View className="h-full rounded-full bg-accent" style={{ width: `${fraction * 100}%` }} />
          </View>
          <View
            className="absolute rounded-full bg-accent"
            style={{ width: dragMs === null ? 14 : 20, height: dragMs === null ? 14 : 20, left: Math.max(fraction * width - (dragMs === null ? 7 : 10), 0) }}
          />
        </View>
      </GestureDetector>
      <View className="flex-row justify-between">
        <Text variant="caption" style={{ fontVariant: ['tabular-nums'] }}>{formatClock(shown)}</Text>
        <Text variant="caption" style={{ fontVariant: ['tabular-nums'] }}>-{formatClock((totalMs - shown) / speed)}</Text>
      </View>
    </View>
  );
}
