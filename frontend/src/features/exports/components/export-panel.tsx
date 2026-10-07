import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Spinner, Switch, useToast } from 'heroui-native';
import { Captions, FileAudio, FileText } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ChoiceChips } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import type { DocumentSummary } from '@/features/library/types';
import { formatMinutes } from '@/features/player/hooks/use-player';
import { usePlayerStore } from '@/features/player/store/player.store';
import { useUsage } from '@/features/voices/hooks/use-voices';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { formatClock } from '@/features/studio/lib/time';

import { exportsApi, type ExportVoicing } from '../api/exports.api';
import { FolderPickCancelled, saveToFolder, savedFolderName } from '../lib/save-to-folder';

const POLL_MS = 2500;
// Up to this many parts get one progress tick each
const MAX_TICKS = 60;
type SubtitleChoice = 'srt' | 'shortSrt' | 'vtt' | 'off';
const SUBTITLE_CHOICES: SubtitleChoice[] = ['srt', 'shortSrt', 'vtt', 'off'];
const SUBTITLE_LABELS: Record<SubtitleChoice, string> = { srt: 'SRT', shortSrt: 'Short lines', vtt: 'VTT', off: 'None' };
const megabytes = (bytes: number) => `${Math.max(bytes / 1_000_000, 0.1).toFixed(1)} MB`;

/** "Download MP3" (with subtitles) for one document: Plus and Pro only */
export function ExportPanel({ document }: { document: DocumentSummary }) {
  const t = useTokens();
  const { toast } = useToast();
  const client = useQueryClient();
  const usage = useUsage();
  // Match the voice in the player if this document is open there
  const voiceId = usePlayerStore((s) => (s.documentId === document.id ? (s.voiceId ?? undefined) : undefined));
  const premium = usage.data ? usage.data.plan.id !== 'free' : null;
  const key = ['export', document.id, voiceId] as const;
  const status = useQuery({
    queryKey: key,
    queryFn: () => exportsApi.status(document.id, voiceId),
    enabled: premium === true,
    refetchInterval: (q) => (q.state.data?.status === 'RUNNING' ? POLL_MS : false),
  });
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Out of minutes: offer the plans next to the message
  const [outOfMinutes, setOutOfMinutes] = useState(false);
  const [folder, setFolder] = useState(savedFolderName);
  const [subtitles, setSubtitles] = useState<SubtitleChoice>('srt');
  const [withText, setWithText] = useState(false);

  if (premium === null || (premium && !status.data)) return <Spinner color={t.accent} className="my-6 self-center" />;

  if (!premium) {
    return (
      <View className="gap-4">
        <Text className="text-[15px] leading-[23px] text-muted">
          Save the whole recording as an MP3, with subtitles, to keep, edit into a video or share. Downloads are part of Plus and Pro.
        </Text>
        <PrimaryButton label="See plans" onPress={() => router.push('/plans')} />
      </View>
    );
  }

  const exp = status.data!;
  const ready = exp.status === 'READY' && exp.upToDate && exp.url;

  const start = async () => {
    setStarting(true);
    setError(null);
    setOutOfMinutes(false);
    try {
      client.setQueryData(key, await exportsApi.start(document.id, voiceId));
      void client.invalidateQueries({ queryKey: ['usage'] });
    } catch (e) {
      setError(getErrorMessage(e));
      setOutOfMinutes(hasErrorCode(e, 'USAGE_LIMIT_REACHED'));
    } finally {
      setStarting(false);
    }
  };

  const save = async (chooseFolder = false) => {
    if (!exp.url) return;
    setSaving(true);
    setError(null);
    try {
      const subtitleUrl = subtitles !== 'off' ? exp.subtitles?.[subtitles] : null;
      const files = [
        { url: exp.url, ext: 'mp3' },
        ...(subtitleUrl ? [{ url: subtitleUrl, ext: subtitles === 'vtt' ? 'vtt' : 'srt' }] : []),
        ...(withText && exp.transcript ? [{ url: exp.transcript, ext: 'txt' }] : []),
      ];
      const name = await saveToFolder(files, document.title, { chooseFolder });
      setFolder(name);
      haptics.success();
      toast.show({ variant: 'success', label: files.length > 1 ? `${files.length} files saved` : 'MP3 saved', description: `In ${name}` });
    } catch (e) {
      if (!(e instanceof FolderPickCancelled)) setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (exp.status === 'RUNNING') {
    const done = exp.chunksDone ?? 0;
    const total = Math.max(exp.chunkCount ?? 1, 1);
    return (
      <View className="gap-3">
        <Text className="text-[16px] font-semibold">{done >= total ? 'Putting the MP3 and subtitles together…' : `Voicing part ${Math.min(done + 1, total)} of ${total}…`}</Text>
        {total <= MAX_TICKS ? (
          // One tick per part, filled as each is voiced (or reused)
          <View className="h-2.5 flex-row" style={{ gap: 3 }} accessibilityLabel={`${done} of ${total} parts ready`}>
            {Array.from({ length: total }, (_, i) => (
              <View key={i} className={`flex-1 rounded-full ${i < done ? 'bg-accent' : 'bg-accent-soft-bg'}`} />
            ))}
          </View>
        ) : (
          <ProgressBar value={done / total} />
        )}
        <Text variant="caption">You can close this. It keeps going, and the MP3 will be here when you come back.</Text>
      </View>
    );
  }

  if (ready) {
    return (
      <View className="gap-4">
        <View className="gap-1 rounded-2xl bg-surface-secondary p-1.5">
          <Deliverable icon={<FileAudio size={18} color={t.accent} />} name={`${document.title}.mp3`} detail={`${formatMinutes((exp.durationMs ?? 0) / 1000)}, ${megabytes(exp.sizeBytes ?? 0)}`} />
          {exp.subtitles && subtitles !== 'off' ? (
            <Deliverable icon={<Captions size={18} color={t.accent} />} name={`${document.title}.${subtitles === 'vtt' ? 'vtt' : 'srt'}`} detail={subtitles === 'shortSrt' ? 'Short lines' : 'Timed to the audio'} />
          ) : null}
          {exp.transcript && withText ? <Deliverable icon={<FileText size={18} color={t.accent} />} name={`${document.title}.txt`} detail="The script" /> : null}
        </View>
        {exp.subtitles ? (
          <View className="gap-1">
            <Text variant="label" className="text-muted">Subtitles</Text>
            <View className="-mx-3">
              <ChoiceChips
                options={SUBTITLE_CHOICES.filter((c) => c !== 'shortSrt' || exp.subtitles?.shortSrt)}
                value={subtitles}
                format={(v) => SUBTITLE_LABELS[v]}
                onChange={setSubtitles}
              />
            </View>
            {subtitles === 'shortSrt' ? <Text variant="caption">One short line at a time, for Reels, Shorts and TikTok.</Text> : null}
          </View>
        ) : null}
        {exp.transcript ? (
          <View className="flex-row items-center justify-between">
            <Text className="text-[15px]">Also save the script as text</Text>
            <Switch isSelected={withText} onSelectedChange={setWithText} accessibilityLabel="Also save the script as text" />
          </View>
        ) : null}
        <InlineAlert message={error} />
        <PrimaryButton label={folder ? `Save to ${folder}` : 'Save to phone'} isLoading={saving} onPress={() => void save()} />
        {folder ? (
          <Pressable onPress={() => void save(true)} disabled={saving} accessibilityRole="button" className="self-center rounded-full px-3 py-1.5 active:bg-default">
            <Text className="text-[14px] font-medium text-accent">Choose another folder</Text>
          </Pressable>
        ) : (
          <Text variant="caption" className="text-center">You&apos;ll pick a folder once; later files go there too.</Text>
        )}
      </View>
    );
  }

  // Nothing yet, out of date, or failed
  return (
    <View className="gap-4">
      <Text className="text-[15px] leading-[23px] text-muted">
        {exp.status === 'READY' && !exp.upToDate
          ? 'The script has changed since the last MP3. Make a fresh one to include the changes.'
          : 'The whole recording as one MP3, with subtitles for your video editor.'}
      </Text>
      <VoicingNote voicing={exp.voicing} />
      <InlineAlert
        message={error ?? (exp.status === 'FAILED' ? exp.error : null)}
        action={outOfMinutes ? <PrimaryButton label="See plans" size="md" variant="secondary" onPress={() => router.push('/plans')} /> : undefined}
      />
      <PrimaryButton label={exp.status === 'FAILED' ? 'Try again' : exp.status === 'READY' ? 'Make a fresh MP3' : 'Prepare MP3'} isLoading={starting} onPress={() => void start()} />
    </View>
  );
}

/**
 * What making the MP3 costs now: only parts without current audio are
 * voiced, so after an edit most of the recording is reused for free.
 */
export function VoicingNote({ voicing }: { voicing?: ExportVoicing }) {
  if (!voicing || !voicing.partCount) return null;
  const { partsToVoice, secondsToVoice, partCount, totalSeconds } = voicing;
  const reused = partCount - partsToVoice;
  const message =
    partsToVoice === 0
      ? 'Every part is already voiced, so this uses none of your minutes.'
      : reused === 0
        ? `All ${partCount === 1 ? 'of it' : `${partCount} parts`} will be voiced, about ${formatClock(secondsToVoice)} of your minutes.`
        : `Only ${partsToVoice === 1 ? '1 part' : `${partsToVoice} parts`} (${formatClock(secondsToVoice)}) will be voiced. The other ${reused} of ${partCount} are reused, saving about ${formatClock(totalSeconds - secondsToVoice)}.`;
  return (
    <View className="flex-row gap-2.5 rounded-2xl bg-accent-soft-bg px-3.5 py-3">
      <Text className="flex-1 text-[14px] leading-[21px] text-accent-soft-fg">{message}</Text>
    </View>
  );
}

/** One file the export saves: its name as it lands in the folder, and what it is */
function Deliverable({ icon, name, detail }: { icon: ReactNode; name: string; detail: string }) {
  return (
    <View className="flex-row items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
      {icon}
      <Text className="flex-1 text-[14px] font-medium" numberOfLines={1}>{name}</Text>
      <Text variant="caption">{detail}</Text>
    </View>
  );
}

/** Standalone sheet (the player menu); the shelf shows the panel inside its own sheet */
export function ExportSheet({ document, onClose }: { document: DocumentSummary | null; onClose: () => void }) {
  return (
    <ActionSheet visible={!!document} onClose={onClose} title="Download MP3 and subtitles">
      {document ? <ExportPanel document={document} /> : null}
    </ActionSheet>
  );
}
