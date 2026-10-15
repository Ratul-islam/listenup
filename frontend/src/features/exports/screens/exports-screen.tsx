import { useQuery } from '@tanstack/react-query';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { Spinner } from 'heroui-native';
import { CircleAlert, Ellipsis, Pause, Play } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import type { DocumentSummary } from '@/features/library/types';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { formatClock } from '@/features/studio/lib/time';
import { useTokens } from '@/lib/use-tokens';

import { exportsApi, type ExportItem } from '../api/exports.api';
import { ExportSheet } from '../components/export-panel';

export const EXPORTS_KEY = ['exports'] as const;
// While an MP3 is being made, its progress is fetched this often
const RUNNING_REFRESH_MS = 4000;

/** "Your exports": every MP3 the listener has made, to play again, save or make anew */
export default function ExportsScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const list = useQuery({
    queryKey: EXPORTS_KEY,
    queryFn: exportsApi.list,
    refetchInterval: (q) => (q.state.data?.some((e) => e.status === 'RUNNING') ? RUNNING_REFRESH_MS : false),
  });
  const preview = usePreview();
  // The document whose export sheet is open (save, subtitles, make it again)
  const [open, setOpen] = useState<Pick<DocumentSummary, 'id' | 'title'> | null>(null);
  const items = list.data ?? [];

  return (
    <CloudBackground>
      <FlatList
        data={items}
        keyExtractor={(e) => e.documentId}
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 10 }}
        ListHeaderComponent={
          <View className="gap-4 pb-2">
            <ScreenHeader title="Your exports" onBack={router.back} />
            {items.length ? (
              <Text className="px-1 text-[15px] leading-[23px] text-muted">Every MP3 you’ve made. Tap one to hear it, or ⋯ to save it, get its subtitles or make it again.</Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <ExportRow
            item={item}
            playing={preview.playingId === item.documentId}
            loading={preview.loadingId === item.documentId}
            onPlay={() => item.url && preview.toggle(item.documentId, item.url)}
            onMore={() => setOpen({ id: item.documentId, title: item.title })}
          />
        )}
        ListEmptyComponent={
          list.isPending ? (
            <Spinner color={t.accent} className="my-8 self-center" />
          ) : (
            <View className="items-center gap-2 px-6 pt-8">
              <Text className="text-center text-[16px] font-semibold">No exports yet</Text>
              <Text variant="caption" className="text-center">
                Open a script or a document and choose Download MP3. Everything you make shows up here, ready to play or save again.
              </Text>
            </View>
          )
        }
      />
      {/* The sheet only reads the document's id and title */}
      <ExportSheet
        document={open as DocumentSummary | null}
        onClose={() => {
          setOpen(null);
          void list.refetch();
        }}
      />
    </CloudBackground>
  );
}

/** One MP3: play it right here, or open its sheet */
function ExportRow({ item, playing, loading, onPlay, onMore }: { item: ExportItem; playing: boolean; loading: boolean; onPlay: () => void; onMore: () => void }) {
  const t = useTokens();
  const made = new Date(item.madeAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const detail =
    item.status === 'RUNNING'
      ? `Making it… ${item.chunksDone} of ${item.chunkCount} parts`
      : item.status === 'FAILED'
        ? (item.error ?? 'This one didn’t finish. Make it again from ⋯')
        : [item.durationMs != null ? formatClock(item.durationMs / 1000) : null, item.voiceName, made].filter(Boolean).join(' · ');
  return (
    <GlassCard className="flex-row items-center gap-3.5 p-3.5">
      <Pressable
        onPress={onPlay}
        disabled={!item.url}
        accessibilityRole="button"
        accessibilityLabel={item.url ? `${playing ? 'Pause' : 'Play'} ${item.title}` : item.title}
        className={`size-12 items-center justify-center rounded-2xl ${item.url ? 'bg-accent-soft-bg active:opacity-80' : 'bg-default'}`}
      >
        {item.status === 'RUNNING' || loading ? (
          <Spinner size="sm" color={t.accent} />
        ) : item.status === 'FAILED' ? (
          <CircleAlert size={20} color={t.muted} />
        ) : playing ? (
          <Pause size={20} color={t.accent} />
        ) : (
          <Play size={20} color={item.url ? t.accent : t.muted} />
        )}
      </Pressable>
      <View className="flex-1 gap-0.5">
        <Text className="text-[16px] font-semibold" numberOfLines={1}>{item.title}</Text>
        <Text variant="caption" numberOfLines={2} className={item.status === 'FAILED' ? 'text-danger' : undefined}>{detail}</Text>
      </View>
      <Pressable onPress={onMore} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Save or make again: ${item.title}`} className="size-9 items-center justify-center rounded-full active:bg-default">
        <Ellipsis size={18} color={t.muted} />
      </Pressable>
    </GlassCard>
  );
}

/** One player for the list: tap to hear an MP3, tap again to pause; the main player stops first */
function usePreview() {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const toggle = (id: string, url: string) => {
    if (current === id && status.playing) return player.pause();
    if (usePlayerStore.getState().isPlaying) audioEngine.pause();
    if (current === id && player.isLoaded) {
      if (status.duration && status.currentTime >= status.duration - 0.2) void player.seekTo(0);
      return player.play();
    }
    setCurrent(id);
    setLoading(id);
    player.replace({ uri: url });
    player.play();
    setLoading(null);
  };

  return { playingId: status.playing ? current : null, loadingId: loading ?? (current && !status.isLoaded ? current : null), toggle };
}
