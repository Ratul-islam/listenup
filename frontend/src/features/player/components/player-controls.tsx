import { Spinner } from 'heroui-native';
import { Moon, RotateCcw, RotateCw } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ActionSheet, SheetAction } from '@/components/ui/action-sheet';
import { PlayPauseIcon } from '@/components/ui/play-pause-icon';
import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { usePressScale } from '@/lib/use-press-scale';
import { cardShadow, useTokens } from '@/lib/use-tokens';

import { audioEngine } from '../engine/audio-engine';
import { usePlayerStore } from '../store/player.store';

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP_OPTIONS = [5, 15, 30, 45, 60];

function Key({ children, onPress, label, active }: { children: ReactNode; onPress: () => void; label: string; active?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`size-12 items-center justify-center rounded-full ${active ? 'bg-accent-soft-bg' : 'active:bg-default'}`}
    >
      {children}
    </Pressable>
  );
}

function SkipIcon({ direction }: { direction: 1 | -1 }) {
  const t = useTokens();
  const Icon = direction === 1 ? RotateCw : RotateCcw;
  return (
    <View className="items-center justify-center">
      <Icon size={26} color={t.foreground} strokeWidth={1.7} />
      <Text className="absolute text-[9px] font-bold" style={{ marginTop: 2 }}>15</Text>
    </View>
  );
}

/** Speed, skip back, play, skip forward, sleep: plain icons around one solid button */
export function PlayerControls() {
  const t = useTokens();
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const speed = usePlayerStore((s) => s.speed);
  const sleepAt = usePlayerStore((s) => s.sleepAt);
  const [sleepOpen, setSleepOpen] = useState(false);
  const press = usePressScale(0.92);

  const nextSpeed = () => audioEngine.setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1);

  return (
    <View className="flex-row items-center justify-between px-2">
      <Key onPress={nextSpeed} label={`Speed ${speed}x, tap to change`}>
        <Text className="text-[15px] font-semibold" style={{ fontVariant: ['tabular-nums'] }}>{speed}×</Text>
      </Key>

      <Key onPress={() => audioEngine.skip(-1)} label="Back 15 seconds">
        <SkipIcon direction={-1} />
      </Key>

      <Animated.View style={press.style}>
        <Pressable
          onPress={() => {
            haptics.tap();
            audioEngine.toggle();
          }}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          className="size-16 items-center justify-center rounded-full bg-accent"
          style={{ boxShadow: cardShadow }}
        >
          {isBuffering && !isPlaying ? <Spinner size="md" color={t.accentForeground} /> : <PlayPauseIcon playing={isPlaying} size={26} color={t.accentForeground} />}
        </Pressable>
      </Animated.View>

      <Key onPress={() => audioEngine.skip(1)} label="Forward 15 seconds">
        <SkipIcon direction={1} />
      </Key>

      <Key onPress={() => setSleepOpen(true)} label={sleepAt ? 'Sleep timer on' : 'Sleep timer'} active={!!sleepAt}>
        <Moon size={22} color={sleepAt ? t.accent : t.foreground} strokeWidth={1.8} fill={sleepAt ? t.accent : 'transparent'} />
      </Key>

      <ActionSheet visible={sleepOpen} onClose={() => setSleepOpen(false)} title="Sleep timer">
        {SLEEP_OPTIONS.map((m) => (
          <SheetAction
            key={m}
            icon={<Moon size={18} color={t.foreground} />}
            label={`${m} minutes`}
            onPress={() => {
              audioEngine.setSleepTimer(m);
              setSleepOpen(false);
            }}
          />
        ))}
        {sleepAt ? (
          <SheetAction
            icon={<Moon size={18} color={t.danger} />}
            label="Turn off"
            destructive
            onPress={() => {
              audioEngine.setSleepTimer(null);
              setSleepOpen(false);
            }}
          />
        ) : null}
      </ActionSheet>
    </View>
  );
}
