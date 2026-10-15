import { router } from 'expo-router';
import { Spinner } from 'heroui-native';
import { MoreHorizontal } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { useOfflineStore } from '@/features/offline/offline-files';
import { formatMinutes } from '@/features/player/hooks/use-player';
import { useTokens } from '@/lib/use-tokens';

import { kindMeta } from '../lib/kind-meta';
import type { DocumentSummary } from '../types';
import { DocumentCover } from './document-cover';

interface DocumentRowProps {
  document: DocumentSummary;
  onMore: (doc: DocumentSummary) => void;
}

/** One item on the shelf: its cover, its title, and a single status line */
export function DocumentRow({ document: doc, onMore }: DocumentRowProps) {
  const t = useTokens();
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
      accessibilityLabel={`${kindMeta[doc.kind].label}: ${doc.title}, ${status}`}
      className="flex-row items-center gap-3.5 rounded-2xl py-2 pl-2 pr-1 active:bg-default"
    >
      <DocumentCover document={doc} width={46} />
      <View className="flex-1 gap-1">
        <Text className="text-[15.5px] font-semibold leading-[21px] tracking-[-0.1px]" numberOfLines={2}>{doc.title}</Text>
        <View className="flex-row items-center gap-1.5">
          {!ready && !failed ? <Spinner size="sm" color={t.muted} /> : null}
          <Text variant="caption" className={failed ? 'text-danger' : undefined} numberOfLines={1}>
            {downloaded && ready ? `${status} · Downloaded` : status}
          </Text>
        </View>
        {started ? <ProgressBar value={fraction} height={3} className="mt-0.5 max-w-[150px]" /> : null}
      </View>
      <Pressable
        onPress={() => onMore(doc)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`More for ${doc.title}`}
        className="size-10 items-center justify-center rounded-full active:bg-default"
      >
        <MoreHorizontal size={18} color={t.muted} />
      </Pressable>
    </Pressable>
  );
}
