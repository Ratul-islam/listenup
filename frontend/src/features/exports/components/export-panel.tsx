import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Spinner, Switch, useToast } from 'heroui-native';
import * as Linking from 'expo-linking';
import { Captions, CircleCheck, FileAudio, FileText, Gauge, Info } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
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

import { useStudioCatalog } from '@/features/studio/hooks/use-studio';
import { formatClock } from '@/features/studio/lib/time';

import { exportsApi, type AudioExport, type ExportVoicing } from '../api/exports.api';
import { exportKey, filesFor, isFollowing, noteSaved, saveWhenReady, useExportStore, type SubtitleChoice } from '../lib/export-runner';
import { ensureFolder, FolderPickCancelled, saveToFolder, savedFolderName } from '../lib/save-to-folder';

// Up to this many parts get one progress tick each
const MAX_TICKS = 60;
const SUBTITLE_CHOICES: SubtitleChoice[] = ['srt', 'shortSrt', 'wordsSrt', 'vtt', 'off'];
const SUBTITLE_LABELS: Record<SubtitleChoice, string> = { srt: 'SRT', shortSrt: 'Short lines', wordsSrt: 'Word by word', vtt: 'VTT', off: 'None' };
const megabytes = (bytes: number) => `${Math.max(bytes / 1_000_000, 0.1).toFixed(1)} MB`;

/**
 * "Download MP3" (with subtitles) for one document: Plus and Pro only. The
 * server makes it in the background; the app saves it to the listener's folder
 * by itself when it's ready, even after this is closed (see export-runner).
 */
export function ExportPanel({ document }: { document: DocumentSummary }) {
  const t = useTokens();
  const { toast } = useToast();
  const client = useQueryClient();
  const usage = useUsage();
  // Match the voice in the player if this document is open there
  const voiceId = usePlayerStore((s) => (s.documentId === document.id ? (s.voiceId ?? undefined) : undefined));
  const premium = usage.data ? usage.data.plan.id !== 'free' : null;
  const key = exportKey(document.id, voiceId);
  // Kept current by the runner while the MP3 is being made
  const status = useQuery({ queryKey: key, queryFn: () => exportsApi.status(document.id, voiceId), enabled: premium === true });
  const job = useExportStore((s) => s.jobs[document.id]);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Out of minutes: offer the plans next to the message
  const [outOfMinutes, setOutOfMinutes] = useState(false);
  const [folder, setFolder] = useState(savedFolderName);
  // A script for a platform starts on that platform's kind of subtitles
  const [subtitles, setSubtitles] = useState<SubtitleChoice>(() => {
    const style = document.studio?.guide?.subtitles;
    return style === 'shortSrt' || style === 'wordsSrt' ? style : style === 'none' ? 'off' : 'srt';
  });
  const [withText, setWithText] = useState(false);
  const exp = status.data;

  // Being made, but not followed yet (started before the app was reopened, or on another phone): save it when it's ready
  useEffect(() => {
    if (exp?.status === 'RUNNING' && !isFollowing(document.id)) {
      void saveWhenReady({ documentId: document.id, title: document.title, voiceId, subtitles, withText }, exp);
    }
  }, [exp, document.id, document.title, voiceId, subtitles, withText]);

  if (premium === null || (premium && !exp)) return <Spinner color={t.accent} className="my-6 self-center" />;

  if (!premium || !exp) {
    return (
      <View className="gap-4">
        <Text className="text-[15px] leading-[23px] text-muted">
          Save the whole recording as an MP3, with subtitles, to keep, edit into a video or share. Downloads are part of Plus and Pro.
        </Text>
        <PrimaryButton label="See plans" onPress={() => router.push('/plans')} />
      </View>
    );
  }

  const ready = exp.status === 'READY' && exp.upToDate && exp.url;

  const start = async () => {
    setStarting(true);
    setError(null);
    setOutOfMinutes(false);
    try {
      // Picked now, so the MP3 can be saved without asking once it's ready
      setFolder((await ensureFolder()).name);
      const started = await exportsApi.start(document.id, voiceId);
      client.setQueryData(key, started);
      void client.invalidateQueries({ queryKey: ['usage'] });
      void saveWhenReady({ documentId: document.id, title: document.title, voiceId, subtitles, withText }, started);
    } catch (e) {
      if (e instanceof FolderPickCancelled) return;
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
      const files = filesFor(exp, { subtitles, withText });
      const name = await saveToFolder(files, document.title, { chooseFolder });
      setFolder(name);
      noteSaved(document.id, name);
      haptics.success();
      toast.show({ variant: 'success', label: files.length > 1 ? `${files.length} files saved` : 'MP3 saved', description: `In ${name}` });
    } catch (e) {
      if (!(e instanceof FolderPickCancelled)) setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const choices = (
    <>
      <PlatformNotes document={document} />
      <FileChoices exp={exp} subtitles={subtitles} withText={withText} onSubtitles={setSubtitles} onWithText={setWithText} />
    </>
  );

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
        <Text variant="caption">
          {`You can close this, or the app. It saves to ${folder ?? 'your folder'} by itself when it's ready.`}
        </Text>
      </View>
    );
  }

  if (ready && job?.phase === 'saving') {
    return (
      <View className="flex-row items-center gap-3 py-2">
        <Spinner color={t.accent} />
        <Text className="flex-1 text-[16px] font-semibold">{`Saving to ${folder ?? 'your folder'}…`}</Text>
      </View>
    );
  }

  if (ready) {
    const saved = job?.phase === 'saved' ? job.folder : null;
    return (
      <View className="gap-4">
        <View className="gap-1 rounded-2xl bg-surface-secondary p-1.5">
          <Deliverable icon={<FileAudio size={18} color={t.accent} />} name={`${document.title}.mp3`} detail={`${formatMinutes((exp.durationMs ?? 0) / 1000)}, ${megabytes(exp.sizeBytes ?? 0)}`} />
          {exp.subtitles && subtitles !== 'off' ? (
            <Deliverable
              icon={<Captions size={18} color={t.accent} />}
              name={`${document.title}.${subtitles === 'vtt' ? 'vtt' : 'srt'}`}
              detail={subtitles === 'shortSrt' ? 'Short lines' : subtitles === 'wordsSrt' ? 'Word by word' : 'Timed to the audio'}
            />
          ) : null}
          {exp.transcript && withText ? <Deliverable icon={<FileText size={18} color={t.accent} />} name={`${document.title}.txt`} detail="The script" /> : null}
        </View>
        {saved ? (
          <View className="flex-row items-center gap-2.5 rounded-2xl bg-accent-soft-bg px-3.5 py-3" accessibilityLiveRegion="polite">
            <CircleCheck size={18} color={t.accent} />
            <Text className="flex-1 text-[14px] leading-[21px] text-accent-soft-fg">{`Saved in ${saved}.`}</Text>
          </View>
        ) : null}
        {choices}
        <InlineAlert message={error ?? (job?.phase === 'failed' ? job.error : null)} />
        <PrimaryButton
          label={saved ? 'Save again' : folder ? `Save to ${folder}` : 'Save to phone'}
          variant={saved ? 'secondary' : 'primary'}
          isLoading={saving}
          onPress={() => void save()}
        />
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
      {choices}
      <InlineAlert
        message={error ?? (exp.status === 'FAILED' ? exp.error : null)}
        action={outOfMinutes ? <PrimaryButton label="See plans" size="md" variant="secondary" onPress={() => router.push('/plans')} /> : undefined}
      />
      <PrimaryButton label={exp.status === 'FAILED' ? 'Try again' : exp.status === 'READY' ? 'Make a fresh MP3' : 'Make MP3'} isLoading={starting} onPress={() => void start()} />
      <Text variant="caption" className="text-center">
        {folder
          ? `It's made on our server, and saves to ${folder} by itself. You can close the app meanwhile.`
          : "You'll pick a folder once. It's made on our server and saves there by itself."}
      </Text>
    </View>
  );
}

/** For a script with a platform: the volume it's finished at, and the platform's rule on AI voices */
function PlatformNotes({ document }: { document: DocumentSummary }) {
  const t = useTokens();
  const catalog = useStudioCatalog();
  const studio = document.studio;
  const guide = studio?.guide;
  if (!guide || !studio?.platform) return null;
  const name = catalog.data?.platforms.find((p) => p.id === studio.platform)?.label ?? 'this platform';
  const volume =
    guide.loudness.label === 'Podcast'
      ? `Volume set for podcasts: ${guide.loudness.lufs} LUFS, as Apple asks.`
      : guide.loudness.label === 'Audiobook'
        ? `Volume set for audiobooks: ${guide.loudness.lufs} LUFS, peaks under ${guide.loudness.peakDb} dB, as Audible asks.`
        : `Volume set for ${name}: ${guide.loudness.lufs} LUFS, so it isn’t quieter than the videos around it.`;
  return (
    <View className="gap-2">
      <View className="flex-row gap-2.5 rounded-2xl bg-surface-secondary px-3.5 py-3">
        <Gauge size={17} color={t.accent} />
        <Text className="flex-1 text-[14px] leading-[21px]">{volume}</Text>
      </View>
      {guide.disclosure ? (
        <View className="flex-row gap-2.5 rounded-2xl bg-surface-secondary px-3.5 py-3">
          <Info size={17} color={t.accent} />
          <View className="flex-1 gap-1">
            <Text className="text-[14px] leading-[21px]">{guide.disclosure.note}</Text>
            <Pressable onPress={() => void Linking.openURL(guide.disclosure!.url)} accessibilityRole="link" hitSlop={6} className="self-start">
              <Text className="text-[14px] font-medium text-accent">Read the rule</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** What's saved next to the MP3: subtitles in one of three forms, and the script as text */
function FileChoices({
  exp,
  subtitles,
  withText,
  onSubtitles,
  onWithText,
}: {
  exp: AudioExport;
  subtitles: SubtitleChoice;
  withText: boolean;
  onSubtitles: (v: SubtitleChoice) => void;
  onWithText: (v: boolean) => void;
}) {
  // An MP3 made before short lines (or word by word) existed has none
  const options = SUBTITLE_CHOICES.filter((c) => (c !== 'shortSrt' && c !== 'wordsSrt') || !exp.subtitles || exp.subtitles[c]);
  return (
    <>
      <View className="gap-1">
        <Text variant="label" className="text-muted">Subtitles</Text>
        <View className="-mx-3">
          <ChoiceChips options={options} value={subtitles} format={(v) => SUBTITLE_LABELS[v]} onChange={onSubtitles} />
        </View>
        {subtitles === 'shortSrt' ? <Text variant="caption">One short line at a time, for Reels, Shorts and TikTok.</Text> : null}
        {subtitles === 'wordsSrt' ? <Text variant="caption">Two or three words at a time, the punchy style of TikTok and Reels captions.</Text> : null}
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-[15px]">Also save the script as text</Text>
        <Switch isSelected={withText} onSelectedChange={onWithText} accessibilityLabel="Also save the script as text" />
      </View>
    </>
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
