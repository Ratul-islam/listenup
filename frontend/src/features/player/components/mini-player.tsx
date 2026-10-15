import { router } from 'expo-router';
import { Spinner } from 'heroui-native';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { PlayPauseIcon } from '@/components/ui/play-pause-icon';
import { Text } from '@/components/ui/text';
import { DocumentCover } from '@/features/library/components/document-cover';
import { usePressScale } from '@/lib/use-press-scale';
import { cardShadow, useTokens } from '@/lib/use-tokens';

import { audioEngine } from '../engine/audio-engine';
import { formatMinutes, usePlayerTimeline } from '../hooks/use-player';
import { usePlayerStore } from '../store/player.store';

/**
 * Persistent player bar above the tabs: what's playing, time left, play/pause.
 * `aside` hides it where the page already shows a player of its own (the
 * shelf's top card), so the same thing is never there twice. It slides in and
 * out rather than popping.
 */
export function MiniPlayer({ aside }: { aside?: boolean }) {
  const t = useTokens();
  const press = usePressScale(0.9);
  const document = usePlayerStore((s) => s.document);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const error = usePlayerStore((s) => s.error);
  const { positionMs, totalMs, speed } = usePlayerTimeline();

  if (!document || aside) return null;
  const fraction = totalMs ? positionMs / totalMs : 0;

  return (
    <Animated.View entering={FadeInDown.duration(240)} exiting={FadeOutDown.duration(180)} className="px-4 pb-2">
      <Pressable
        onPress={() => router.push('/player')}
        accessibilityRole="button"
        accessibilityLabel={`Open player: ${document.title}`}
        className="overflow-hidden rounded-3xl bg-surface dark:border dark:border-border"
        style={{ boxShadow: cardShadow }}
      >
        <View className="flex-row items-center gap-3 py-2 pl-3 pr-2.5">
          {/* The same cover it has on the shelf, so it's recognised at a glance */}
          <DocumentCover document={document} width={32} />
          <View className="flex-1">
            <Text className="text-[15px] font-semibold" numberOfLines={1}>{document.title}</Text>
            <Text variant="caption" numberOfLines={1} className={error ? 'text-danger' : undefined}>
              {error ?? `${formatMinutes((totalMs - positionMs) / 1000 / speed)} left`}
            </Text>
          </View>
          <Animated.View style={press.style}>
            <Pressable
              onPress={() => audioEngine.toggle()}
              onPressIn={press.onPressIn}
              onPressOut={press.onPressOut}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              className="size-11 items-center justify-center rounded-full bg-accent"
            >
              {isBuffering && !isPlaying ? <Spinner size="sm" color={t.accentForeground} /> : <PlayPauseIcon playing={isPlaying} size={18} color={t.accentForeground} />}
            </Pressable>
          </Animated.View>
        </View>
        <View className="h-[2px] bg-surface-tertiary">
          <View className="h-[2px] bg-accent" style={{ width: `${fraction * 100}%` }} />
        </View>
      </Pressable>
    </Animated.View>
  );
}
