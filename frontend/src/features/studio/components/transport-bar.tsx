import { Download, Pause, Play } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { globalPosition, timeline, usePlayerStore } from '@/features/player/store/player.store';
import type { ReaderChunk } from '@/features/library/types';
import { haptics } from '@/lib/haptics';
import { cardShadow, useTokens } from '@/lib/use-tokens';

import { formatClock } from '../lib/time';

interface TransportBarProps {
  documentId: string;
  chunks: ReaderChunk[];
  voiceId?: string;
  onExport: () => void;
}

const tabular = { fontVariant: ['tabular-nums' as const] };

/**
 * Studio's transport: play and pause the script right here, where it is on the
 * timeline, and the way out to the finished files. It follows the player when
 * this script is the one playing.
 */
export function TransportBar({ documentId, chunks, voiceId, onExport }: TransportBarProps) {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const loaded = usePlayerStore((s) => s.documentId === documentId && s.status === 'ready');
  const isPlaying = usePlayerStore((s) => s.documentId === documentId && s.isPlaying);
  const buffering = usePlayerStore((s) => s.documentId === documentId && s.isBuffering);
  const position = usePlayerStore((s) => (s.documentId === documentId ? globalPosition(s).positionMs : 0));
  const part = usePlayerStore((s) => (s.documentId === documentId ? s.chunkIndex : 0));
  const total = timeline(chunks).total;

  const toggle = () => {
    haptics.tap();
    if (loaded) return audioEngine.toggle();
    void audioEngine.open(documentId, { autoplay: true, voiceId });
  };

  return (
    <View className="absolute inset-x-0 bottom-0 px-4" style={{ paddingBottom: insets.bottom + 12 }}>
      <View className="flex-row items-center gap-3 rounded-3xl bg-surface py-2.5 pl-2.5 pr-3 dark:border dark:border-border" style={{ boxShadow: cardShadow }}>
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play the script'}
          className="size-12 items-center justify-center rounded-full bg-accent active:opacity-85"
        >
          {isPlaying ? <Pause size={20} color={t.accentForeground} fill={t.accentForeground} /> : <Play size={20} color={t.accentForeground} fill={t.accentForeground} style={{ marginLeft: 2 }} />}
        </Pressable>
        <View className="flex-1">
          <Text className="text-[17px] font-bold" style={tabular} accessibilityLabel={`${formatClock(position / 1000)} of ${formatClock(total / 1000)}`}>
            {formatClock(position / 1000)}
            <Text className="text-[15px] font-medium text-muted" style={tabular}>{` / ${formatClock(total / 1000)}`}</Text>
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {buffering ? 'Voicing…' : loaded ? `Part ${part + 1} of ${chunks.length}` : `${chunks.length === 1 ? '1 part' : `${chunks.length} parts`}`}
          </Text>
        </View>
        <Pressable
          onPress={onExport}
          accessibilityRole="button"
          className="h-11 flex-row items-center gap-2 rounded-full bg-accent-soft-bg px-4 active:opacity-80"
        >
          <Download size={17} color={t.accent} />
          <Text className="text-[15px] font-semibold text-accent-soft-fg">Export</Text>
        </Pressable>
      </View>
    </View>
  );
}
