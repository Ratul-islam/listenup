import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ChoiceChips } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { exportsApi, type AudioExport } from '@/features/exports/api/exports.api';
import { VoicingNote } from '@/features/exports/components/export-panel';
import { ensureFolder, FolderPickCancelled, saveToFolder } from '@/features/exports/lib/save-to-folder';
import type { DocumentSummary } from '@/features/library/types';
import { useUsage } from '@/features/voices/hooks/use-voices';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';

import type { PlatformId, StudioCatalog } from '../api/studio.api';
import { formatClock } from '../lib/time';
import { ScriptChoice } from './script-choice';

type Style = 'wordsSrt' | 'shortSrt' | 'srt';
const STYLE_LABELS: Record<Style, string> = { wordsSrt: 'Word by word', shortSrt: 'Short lines', srt: 'Full lines' };

interface Cue {
  start: number;
  text: string;
}

/** An SRT file as its captions: when each starts, and its words */
function parseSrt(srt: string): Cue[] {
  return srt
    .replace(/\r/g, '')
    .split(/\n\n+/)
    .flatMap((block) => {
      const [, time, ...lines] = block.trim().split('\n');
      const m = /^(\d+):(\d+):(\d+),(\d+)/.exec(time ?? '');
      return m && lines.length ? [{ start: +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, text: lines.join(' ') }] : [];
    });
}

/**
 * Subtitles for a video, in the platform's style: word by word for TikTok and Reels, short lines
 * for Shorts, full lines for YouTube and Facebook. They're timed to the voiceover, so the script
 * is voiced (and its MP3 made) first; then the subtitles can be saved on their own or copied.
 */
export function SubtitlesSheet({
  visible,
  onClose,
  scripts,
  platforms,
  catalog,
}: {
  visible: boolean;
  onClose: () => void;
  scripts: DocumentSummary[];
  platforms: PlatformId[];
  catalog: StudioCatalog;
}) {
  const [script, setScript] = useState<DocumentSummary | null>(null);
  const close = () => {
    setScript(null);
    onClose();
  };
  return (
    <ActionSheet visible={visible} onClose={close} title={script ? script.title : 'Subtitles'}>
      {script ? (
        <Maker key={script.id} script={script} platforms={platforms} catalog={catalog} onBack={() => setScript(null)} />
      ) : (
        <View className="gap-3">
          <Text className="text-[15px] leading-[22px] text-muted">Pick a script. Its subtitles are timed to its voiceover.</Text>
          <ScriptChoice scripts={scripts} onPick={setScript} empty="Make a script first. Its subtitles come from its voiceover." />
        </View>
      )}
    </ActionSheet>
  );
}

function Maker({ script, platforms, catalog, onBack }: { script: DocumentSummary; platforms: PlatformId[]; catalog: StudioCatalog; onBack: () => void }) {
  const { toast } = useToast();
  const client = useQueryClient();
  const usage = useUsage();
  const premium = usage.data ? usage.data.plan.id !== 'free' : null;
  const own = script.studio?.platform;
  const platform = own && platforms.includes(own) ? own : platforms[0];
  const suggested = catalog.platforms.find((p) => p.id === platform)?.subtitles;
  const [style, setStyle] = useState<Style>(suggested === 'wordsSrt' || suggested === 'shortSrt' ? suggested : 'srt');
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = ['export', script.id, undefined] as const;
  const status = useQuery({
    queryKey: key,
    queryFn: () => exportsApi.status(script.id),
    enabled: premium === true,
    refetchInterval: (q) => (q.state.data?.status === 'RUNNING' ? 3000 : false),
  });
  const exp = status.data;
  const ready = exp?.status === 'READY' && exp.upToDate && !!exp.subtitles;
  const url = ready ? (exp.subtitles?.[style] ?? null) : null;
  const cues = useQuery({ queryKey: ['subtitles', url], queryFn: async () => parseSrt(await (await fetch(url!)).text()), enabled: !!url, staleTime: Infinity });

  if (premium === false) {
    return (
      <View className="gap-4">
        <Text className="text-[15px] leading-[23px] text-muted">Subtitles come with the MP3, which is part of Plus and Pro.</Text>
        <PrimaryButton label="See plans" onPress={() => router.push('/plans')} />
      </View>
    );
  }
  if (!exp) return <Spinner className="my-6 self-center" />;

  const make = async () => {
    setStarting(true);
    setError(null);
    try {
      client.setQueryData(key, await exportsApi.start(script.id));
      void client.invalidateQueries({ queryKey: ['usage'] });
    } catch (e) {
      setError(getErrorMessage(e));
      if (hasErrorCode(e, 'USAGE_LIMIT_REACHED')) toast.show({ variant: 'danger', label: 'Out of minutes', description: 'See plans for more.' });
    } finally {
      setStarting(false);
    }
  };
  const save = async () => {
    if (!url) return;
    setSaving(true);
    setError(null);
    try {
      await ensureFolder();
      const folder = await saveToFolder([{ url, ext: 'srt' }], `${script.title} (${STYLE_LABELS[style].toLowerCase()})`);
      haptics.success();
      toast.show({ variant: 'success', label: 'Subtitles saved', description: `In ${folder}` });
    } catch (e) {
      if (!(e instanceof FolderPickCancelled)) setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const copy = async () => {
    try {
      await Clipboard.setStringAsync((cues.data ?? []).map((c) => c.text).join('\n'));
      haptics.tap();
      toast.show({ variant: 'success', label: 'Subtitle text copied' });
    } catch {
      toast.show({ variant: 'danger', label: 'Couldn’t copy just now' });
    }
  };

  return (
    <View className="gap-4">
      <View className="-mx-3">
        <ChoiceChips options={['wordsSrt', 'shortSrt', 'srt'] as Style[]} value={style} format={(s) => STYLE_LABELS[s]} onChange={setStyle} />
      </View>
      {ready ? (
        <>
          <Preview cues={cues.data} loading={cues.isPending} />
          <PrimaryButton label="Save subtitles (SRT)" isLoading={saving} onPress={() => void save()} />
          <PrimaryButton label="Copy the text" variant="secondary" isDisabled={!cues.data?.length} onPress={() => void copy()} />
        </>
      ) : exp.status === 'RUNNING' ? (
        <View className="gap-2">
          <Text className="text-[15px] font-semibold">Voicing it and timing the subtitles…</Text>
          <ProgressBar value={(exp.chunksDone ?? 0) / Math.max(exp.chunkCount ?? 1, 1)} />
          <Text variant="caption">You can close this; it carries on.</Text>
        </View>
      ) : (
        <>
          <Text className="text-[15px] leading-[22px] text-muted">
            {exp.status === 'READY' ? 'The script changed since its subtitles were made. Make them again to match.' : 'Subtitles are timed to the voiceover, so the script is voiced first. Its MP3 is made too, ready in Your exports.'}
          </Text>
          <VoicingNote voicing={exp.voicing as AudioExport['voicing']} />
          <PrimaryButton label="Make subtitles" isLoading={starting} onPress={() => void make()} />
        </>
      )}
      <InlineAlert message={error ?? (exp.status === 'FAILED' ? exp.error : null) ?? null} />
      <Pressable onPress={onBack} accessibilityRole="button" className="self-center rounded-full px-3 py-1.5 active:bg-default">
        <Text className="text-[14px] font-medium text-accent">Another script</Text>
      </Pressable>
    </View>
  );
}

/** The first captions as they'd sit on a vertical video: big, centred, one at a time */
function Preview({ cues, loading }: { cues?: Cue[]; loading: boolean }) {
  if (loading) return <Spinner className="my-4 self-center" />;
  if (!cues?.length) return <Text variant="caption">No subtitles in this one.</Text>;
  return (
    <View className="gap-2 rounded-2xl bg-[#14121c] p-4">
      {cues.slice(0, 6).map((c, i) => (
        <View key={i} className="flex-row items-baseline gap-3">
          <Text className="w-10 text-[12px] text-white/50" style={{ fontVariant: ['tabular-nums'] }}>{formatClock(c.start)}</Text>
          <Text className="flex-1 text-center text-[18px] font-bold text-white">{c.text}</Text>
        </View>
      ))}
      {cues.length > 6 ? <Text className="text-center text-[12px] text-white/50">and {cues.length - 6} more</Text> : null}
    </View>
  );
}
