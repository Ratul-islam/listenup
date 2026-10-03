import { router } from 'expo-router';
import { Spinner } from 'heroui-native';
import { AudioLines, Pause, Play } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { cardShadow, useTokens } from '@/lib/use-tokens';

import { audioEngine } from '../engine/audio-engine';
import { formatMinutes, usePlayerTimeline } from '../hooks/use-player';
import { usePlayerStore } from '../store/player.store';

/** Persistent player bar above the tabs: what's playing, time left, play/pause */
export function MiniPlayer() {
  const t = useTokens();
  const document = usePlayerStore((s) => s.document);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const error = usePlayerStore((s) => s.error);
  const { positionMs, totalMs, speed } = usePlayerTimeline();

  if (!document) return null;
  const fraction = totalMs ? positionMs / totalMs : 0;

  return (
    <View className="px-4 pb-2">
      <Pressable
        onPress={() => router.push('/player')}
        accessibilityRole="button"
        accessibilityLabel={`Open player: ${document.title}`}
        className="overflow-hidden rounded-3xl bg-surface dark:border dark:border-border"
        style={{ boxShadow: cardShadow }}
      >
        <View className="flex-row items-center gap-3 p-2 pr-2.5">
          <IconTile size={44}>
            <AudioLines size={20} color={t.accent} />
          </IconTile>
          <View className="flex-1">
            <Text className="text-[15px] font-semibold" numberOfLines={1}>{document.title}</Text>
            <Text variant="caption" numberOfLines={1} className={error ? 'text-danger' : undefined}>
              {error ?? `${formatMinutes((totalMs - positionMs) / 1000 / speed)} left`}
            </Text>
          </View>
          <Pressable
            onPress={() => audioEngine.toggle()}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            className="size-11 items-center justify-center rounded-full bg-accent active:opacity-85"
          >
            {isBuffering && !isPlaying ? (
              <Spinner size="sm" color={t.accentForeground} />
            ) : isPlaying ? (
              <Pause size={18} color={t.accentForeground} fill={t.accentForeground} />
            ) : (
              <Play size={18} color={t.accentForeground} fill={t.accentForeground} style={{ marginLeft: 2 }} />
            )}
          </Pressable>
        </View>
        <View className="h-[2px] bg-surface-tertiary">
          <View className="h-[2px] bg-accent" style={{ width: `${fraction * 100}%` }} />
        </View>
      </Pressable>
    </View>
  );
}
