import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Spinner } from 'heroui-native';
import { ChevronDown, Ellipsis, Lock, Mic, Pause, Plus, Replace, RotateCcw } from 'lucide-react-native';
import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { ExportSheet } from '@/features/exports/components/export-panel';
import { documentsApi } from '@/features/library/api/documents.api';
import { DocumentActions } from '@/features/library/components/document-actions';
import type { DocumentSummary, ReaderChunk } from '@/features/library/types';
import { playbackApi } from '@/features/player/api/playback.api';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { chunkDuration, timeline, usePlayerStore } from '@/features/player/store/player.store';
import { VoicePickerSheet } from '@/features/voices/components/voice-picker-sheet';
import { useVoice } from '@/features/voices/hooks/use-voices';
import { LANGS } from '@/lib/languages';
import { cardShadow, useTokens } from '@/lib/use-tokens';

import { ArrangementBar } from '../components/arrangement-bar';
import { PartSheet } from '../components/part-sheet';
import { ReplaceSheet } from '../components/replace-sheet';
import { TransportBar } from '../components/transport-bar';
import { Waveform } from '../components/waveform';
import { useScript } from '../hooks/use-scripts';
import { formatClock } from '../lib/time';

const tabular = { fontVariant: ['tabular-nums' as const] };

/**
 * A script in Studio: the whole script as an arrangement, then each part as a
 * track with its real waveform and where it starts. Tap a track to change it,
 * redo a sentence, give it a voice or a pause, or lock it; only that part is
 * voiced again. The transport plays it right here, and leads to the export.
 */
export default function ScriptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const list = useRef<FlatList<ReaderChunk>>(null);
  const playing = usePlayerStore((s) => (s.documentId === id ? s.voiceId : undefined));
  const doc = useQuery({
    queryKey: ['document', id],
    queryFn: () => documentsApi.get(id),
    refetchInterval: (q) => (q.state.data && q.state.data.status !== 'READY' && q.state.data.status !== 'FAILED' ? 2000 : false),
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const voiceId = chosen ?? playing ?? doc.data?.progress?.voiceId ?? null;
  const ready = doc.data?.status === 'READY';
  const script = useScript(ready ? id : '', voiceId);
  const [selected, setSelected] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [exporting, setExporting] = useState<DocumentSummary | null>(null);
  const [actions, setActions] = useState<DocumentSummary | null>(null);
  const [replacing, setReplacing] = useState(false);

  const chunks = useMemo(() => script.data?.chunks ?? [], [script.data]);
  // Where each part starts in the finished recording, pauses included
  const starts = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < chunks.length; i++) out.push(i ? out[i - 1] + chunkDuration(chunks[i - 1]) + (chunks[i - 1].pauseAfterMs ?? 0) : 0);
    return out;
  }, [chunks]);
  const languages = useMemo(() => LANGS.filter((lang) => chunks.some((c) => c.language === lang)), [chunks]);
  const voice = useVoice(script.data?.voices[languages[0] ?? 'en']);
  const tiers = script.data?.tiers;
  const isFree = useMemo(() => (c: ReaderChunk) => (c.tier ?? tiers?.[c.language]) === 'phone', [tiers]);
  const serverParts = chunks.filter((c) => !isFree(c));
  const voiced = serverParts.filter((c) => c.durationMs != null).length;
  const totalSec = (timeline(chunks).total + chunks.reduce((n, c) => n + (c.pauseAfterMs ?? 0), 0)) / 1000;
  const document = script.data?.document ?? doc.data;
  const part = selected != null ? (chunks.find((c) => c.index === selected) ?? null) : null;

  /** Plays from a part, or from a character in it (a sentence), right here */
  const play = async (index = 0, char?: number) => {
    setSelected(null);
    await audioEngine.open(id, { autoplay: false, voiceId: voiceId ?? undefined });
    if (char) void audioEngine.replayFrom(index, char);
    else audioEngine.playChunk(index);
  };

  const changeVoice = (next: string) => {
    setPicking(false);
    setChosen(next);
    if (usePlayerStore.getState().documentId === id) return void audioEngine.setVoice(next);
    // Remembered with the listening position, so the MP3 and the player use it too
    const progress = doc.data?.progress;
    void playbackApi.saveProgress(id, { chunkIndex: progress?.chunkIndex ?? 0, offsetMs: progress?.offsetMs ?? 0, voiceId: next, listenedSec: 0 });
  };

  const jumpTo = (index: number) => {
    list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    setSelected(index);
  };

  const header = (
    <View className="gap-4 pb-4" style={{ paddingTop: insets.top + 6 }}>
      <ScreenHeader
        title={document?.title ?? 'Script'}
        onBack={router.back}
        right={
          document ? (
            <View className="flex-row gap-1">
              {ready ? (
                <IconButton accessibilityLabel="Find and replace" onPress={() => setReplacing(true)} size={44}>
                  <Replace size={19} color={t.foreground} />
                </IconButton>
              ) : null}
              <IconButton accessibilityLabel="More" onPress={() => setActions(document)} size={44}>
                <Ellipsis size={20} color={t.foreground} />
              </IconButton>
            </View>
          ) : undefined
        }
      />
      {ready && script.data ? (
        <View className="gap-3.5 rounded-[28px] bg-surface p-4 dark:border dark:border-border" style={{ boxShadow: cardShadow }}>
          <View className="flex-row items-end justify-between">
            <View>
              <Text className="text-[34px] font-bold leading-[38px]" style={tabular} accessibilityLabel={`Length ${formatClock(totalSec)}`}>
                {formatClock(totalSec)}
              </Text>
              <Text variant="caption">{chunks.length === 1 ? '1 part' : `${chunks.length} parts`}</Text>
            </View>
            <Pressable
              onPress={() => setPicking(true)}
              accessibilityRole="button"
              accessibilityLabel={`Read by ${voice?.name ?? ''}. Change the voice`}
              className="flex-row items-center gap-1.5 rounded-full bg-accent-soft-bg px-3.5 py-2 active:opacity-80"
            >
              <Mic size={15} color={t.accent} />
              <Text className="text-[14px] font-semibold text-accent-soft-fg">{voice?.name ?? '…'}</Text>
              <ChevronDown size={14} color={t.accent} />
            </Pressable>
          </View>
          <ArrangementBar documentId={id} chunks={chunks} isFree={isFree} onSelect={jumpTo} />
          <Text variant="caption">
            {serverParts.length === 0
              ? 'Voiced on this phone, free.'
              : voiced === serverParts.length
                ? 'Every part is voiced. A change re-voices only what you change.'
                : `${voiced} of ${serverParts.length} parts voiced. The outlined ones are voiced when you play or export them.`}
            {document?.voicedSec ? ` This script has used ${formatClock(document.voicedSec)} of your minutes.` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (!ready) {
    return (
      <CloudBackground>
        <View className="flex-1 px-5">
          {header}
          <View className="flex-1 items-center justify-center gap-3 pb-24">
            {doc.data?.status === 'FAILED' ? (
              <Text className="text-center text-[15px] text-danger">{doc.data.error ?? 'Couldn’t read this script.'}</Text>
            ) : (
              <>
                <Spinner color={t.accent} />
                <Text variant="caption">Splitting your script into parts…</Text>
              </>
            )}
          </View>
        </View>
      </CloudBackground>
    );
  }

  return (
    <CloudBackground>
      <FlatList
        ref={list}
        data={chunks}
        keyExtractor={(c) => String(c.index)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 120, gap: 8 }}
        ListHeaderComponent={header}
        ListEmptyComponent={script.isPending ? <Spinner color={t.accent} className="my-8 self-center" /> : null}
        onScrollToIndexFailed={({ index }) => setTimeout(() => list.current?.scrollToIndex({ index, animated: true }), 250)}
        renderItem={({ item }) => (
          <Track
            documentId={id}
            part={item}
            startMs={starts[item.index] ?? 0}
            free={isFree(item)}
            scriptVoiceId={script.data?.voices[item.language]}
            onPress={() => setSelected(item.index)}
          />
        )}
        ListFooterComponent={
          chunks.length ? (
            <Pressable
              onPress={() => setSelected(chunks[chunks.length - 1].index)}
              accessibilityRole="button"
              className="mt-1 flex-row items-center justify-center gap-2 self-center rounded-full px-4 py-2.5 active:bg-default"
            >
              <Plus size={16} color={t.accent} />
              <Text className="text-[14px] font-medium text-accent">Add to the end</Text>
            </Pressable>
          ) : null
        }
      />

      <TransportBar documentId={id} chunks={chunks} voiceId={voiceId ?? undefined} onExport={() => document && setExporting(document)} />

      <PartSheet
        documentId={id}
        title={document?.title ?? 'Script'}
        part={part}
        scriptVoiceId={part ? script.data?.voices[part.language] : undefined}
        free={part ? isFree(part) : false}
        onlyPart={chunks.length === 1}
        onPlay={(index, char) => void play(index, char)}
        onClose={() => setSelected(null)}
      />
      <VoicePickerSheet
        visible={picking}
        onClose={() => setPicking(false)}
        languages={languages}
        selectedIds={Object.values(script.data?.voices ?? {})}
        onSelect={(v) => changeVoice(v.id)}
      />
      <ExportSheet document={exporting} onClose={() => setExporting(null)} />
      <DocumentActions document={actions} onClose={() => setActions(null)} onDeleted={router.back} />
      <ReplaceSheet documentId={id} visible={replacing} onClose={() => setReplacing(false)} />
    </CloudBackground>
  );
}

/**
 * One part as a track: where it starts, its waveform (lit as it plays), its
 * words, and anything set on it: its own voice, a pause, redone sentences, a lock.
 */
const Track = memo(function Track({
  documentId,
  part,
  startMs,
  free,
  scriptVoiceId,
  onPress,
}: {
  documentId: string;
  part: ReaderChunk;
  startMs: number;
  free: boolean;
  scriptVoiceId?: string;
  onPress: () => void;
}) {
  const t = useTokens();
  const voiced = free || part.durationMs != null;
  // Only the track playing re-renders as the position moves
  const progress = usePlayerStore((s) => (s.documentId === documentId && s.chunkIndex === part.index ? Math.min(s.positionMs / chunkDuration(part), 1) : null));
  const own = useVoice(part.ownVoiceId && part.ownVoiceId !== scriptVoiceId ? part.ownVoiceId : null);
  const redone = Object.keys(part.sentenceTakes ?? {}).length;
  const marks: ReactNode[] = [
    own ? <Mark key="voice" icon={<Mic size={12} color={t.accent} />} label={own.name} /> : null,
    part.pauseAfterMs ? <Mark key="pause" icon={<Pause size={12} color={t.accent} />} label={`${part.pauseAfterMs / 1000} s`} /> : null,
    redone ? <Mark key="redo" icon={<RotateCcw size={12} color={t.accent} />} label={redone === 1 ? '1 sentence redone' : `${redone} sentences redone`} /> : null,
    part.locked ? <Mark key="lock" icon={<Lock size={12} color={t.accent} />} label="Locked" /> : null,
  ].filter(Boolean);

  return (
    <GlassCard
      onPress={onPress}
      accessibilityLabel={`Part ${part.index + 1}, starts at ${formatClock(startMs / 1000)}${voiced ? '' : ', not voiced yet'}${part.locked ? ', locked' : ''}. ${part.text}`}
      className={`gap-2 px-4 py-3.5 ${progress !== null ? 'border border-accent' : ''}`}
    >
      <View className="flex-row items-center gap-3">
        <Text className={`w-11 text-[12px] font-semibold ${progress !== null ? 'text-accent' : 'text-muted'}`} style={tabular}>
          {formatClock(startMs / 1000)}
        </Text>
        <View className="flex-1">
          <Waveform peaks={part.peaks} voiced={voiced} progress={progress ?? 0} height={26} />
        </View>
      </View>
      <Text className="text-[15px] leading-[22px]" numberOfLines={3}>{part.text}</Text>
      {marks.length ? <View className="flex-row flex-wrap gap-1.5">{marks}</View> : null}
    </GlassCard>
  );
});

function Mark({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-accent-soft-bg px-2 py-1">
      {icon}
      <Text className="text-[12px] font-medium text-accent-soft-fg">{label}</Text>
    </View>
  );
}
