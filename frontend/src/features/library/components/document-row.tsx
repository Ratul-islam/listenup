import { router } from 'expo-router';
import { Spinner } from 'heroui-native';
import { MoreHorizontal } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { IconTile } from '@/components/ui/icon-tile';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { useOfflineStore } from '@/features/offline/offline-files';
import { formatMinutes } from '@/features/player/hooks/use-player';
import { useTokens } from '@/lib/use-tokens';

import { kindMeta } from '../lib/kind-meta';
import type { DocumentSummary } from '../types';

interface DocumentRowProps {
  document: DocumentSummary;
  onMore: (doc: DocumentSummary) => void;
}

/** One line of the shelf: icon, title, and a single status line */
export function DocumentRow({ document: doc, onMore }: DocumentRowProps) {
  const t = useTokens();
  const Icon = kindMeta[doc.kind].icon;
  const ready = doc.status === 'READY';
  const failed = doc.status === 'FAILED';
  const fraction = doc.progress?.completedAt ? 1 : (doc.progress?.fraction ?? 0);
  const started = fraction > 0 && fraction < 1;
  const downloaded = useOfflineStore((s) => !!s.downloads[doc.id]);

  const status = failed
    ? "Couldn't read this file"
    : !ready
      ? doc.kind === 'IMAGE' || doc.usedOcr
        ? 'Reading the page…'
        : 'Preparing…'
      : fraction >= 1
        ? 'Finished'
        : started
          ? `${formatMinutes(doc.estimatedDurationSec * (1 - fraction))} left`
          : formatMinutes(doc.estimatedDurationSec);

  const open = () => {
    if (!ready) return onMore(doc);
    void audioEngine.open(doc.id, { autoplay: false });
    router.push('/player');
  };

  return (
    <Pressable
      onPress={open}
      onLongPress={() => onMore(doc)}
      accessibilityRole="button"
      accessibilityLabel={`${doc.title}, ${status}`}
      className="flex-row items-center gap-3.5 rounded-2xl px-2 py-2.5 active:bg-default"
    >
      <IconTile size={48}>
        <Icon size={21} color={t.accent} strokeWidth={1.9} />
      </IconTile>
      <View className="flex-1 gap-1">
        <Text className="text-[16px] font-semibold leading-[21px]" numberOfLines={2}>{doc.title}</Text>
        <View className="flex-row items-center gap-1.5">
          {!ready && !failed ? <Spinner size="sm" color={t.muted} /> : null}
          <Text variant="caption" className={failed ? 'text-danger' : undefined} numberOfLines={1}>
            {downloaded && ready ? `${status} · Downloaded` : status}
          </Text>
        </View>
        {started ? <ProgressBar value={fraction} height={3} className="mt-1 max-w-[180px]" /> : null}
      </View>
      <Pressable
        onPress={() => onMore(doc)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`More for ${doc.title}`}
        className="size-9 items-center justify-center rounded-full active:bg-default"
      >
        <MoreHorizontal size={18} color={t.muted} />
      </Pressable>
    </Pressable>
  );
}
