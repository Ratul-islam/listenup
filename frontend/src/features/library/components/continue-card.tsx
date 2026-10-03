import { router } from 'expo-router';
import { Pause, Play } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { formatMinutes } from '@/features/player/hooks/use-player';
import { usePlayerStore } from '@/features/player/store/player.store';
import { useTokens } from '@/lib/use-tokens';

import { useDocuments } from '../hooks/use-documents';

/** The one raised card on the shelf: pick up the most recent unfinished item. Hidden when there is none. */
export function ContinueCard() {
  const t = useTokens();
  const { data } = useDocuments({ category: 'all', sort: 'progress' });
  const doc = data?.items.find((d) => d.status === 'READY' && d.progress && !d.progress.completedAt) ?? null;
  const active = usePlayerStore((s) => !!doc && s.documentId === doc.id && (s.isPlaying || s.isBuffering));

  if (!doc) return null;
  const fraction = doc.progress?.fraction ?? 0;

  return (
    <GlassCard
      raised
      className="gap-4 p-5"
      onPress={() => {
        void audioEngine.open(doc.id, { autoplay: false });
        router.push('/player');
      }}
      accessibilityLabel={`Continue ${doc.title}`}
    >
      <View className="flex-row items-center gap-4">
        <View className="flex-1 gap-1">
          <Text variant="caption">Continue listening</Text>
          <Text className="text-[20px] font-bold leading-[26px] tracking-[-0.3px]" numberOfLines={2}>{doc.title}</Text>
          <Text variant="caption">{formatMinutes(doc.estimatedDurationSec * (1 - fraction))} left</Text>
        </View>
        <Pressable
          onPress={() => (active ? audioEngine.pause() : void audioEngine.open(doc.id))}
          accessibilityRole="button"
          accessibilityLabel={active ? 'Pause' : 'Play'}
          className="size-14 items-center justify-center rounded-full bg-accent active:opacity-85"
        >
          {active ? (
            <Pause size={22} color={t.accentForeground} fill={t.accentForeground} />
          ) : (
            <Play size={22} color={t.accentForeground} fill={t.accentForeground} style={{ marginLeft: 3 }} />
          )}
        </Pressable>
      </View>
      <ProgressBar value={fraction} />
    </GlassCard>
  );
}
