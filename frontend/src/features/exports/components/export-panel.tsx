import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Download } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import type { DocumentSummary } from '@/features/library/types';
import { formatMinutes } from '@/features/player/hooks/use-player';
import { usePlayerStore } from '@/features/player/store/player.store';
import { useUsage } from '@/features/voices/hooks/use-voices';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { exportsApi } from '../api/exports.api';
import { FolderPickCancelled, saveToFolder, savedFolderName } from '../lib/save-to-folder';

const POLL_MS = 2500;
const megabytes = (bytes: number) => `${Math.max(bytes / 1_000_000, 0.1).toFixed(1)} MB`;

/** "Download MP3" for one document: Plus and Pro only */
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

  if (premium === null || (premium && !status.data)) return <Spinner color={t.accent} className="my-6 self-center" />;

  if (!premium) {
    return (
      <View className="gap-4">
        <Text className="text-[15px] leading-[23px] text-muted">
          Save the whole recording as an MP3 to keep, play anywhere or share. Downloads are part of Plus and Pro.
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
      const name = await saveToFolder(exp.url, document.title, { chooseFolder });
      setFolder(name);
      haptics.success();
      toast.show({ variant: 'success', label: 'MP3 saved', description: `In ${name}` });
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
        <Text className="text-[16px] font-semibold">{done >= total ? 'Putting the MP3 together…' : `Voicing part ${Math.min(done + 1, total)} of ${total}…`}</Text>
        <ProgressBar value={done / total} />
        <Text variant="caption">You can close this. It keeps going, and the MP3 will be here when you come back.</Text>
      </View>
    );
  }

  if (ready) {
    return (
      <View className="gap-4">
        <View className="flex-row items-center gap-3">
          <Download size={20} color={t.accent} />
          <Text className="flex-1 text-[16px] font-semibold">
            Ready: {formatMinutes((exp.durationMs ?? 0) / 1000)}, {megabytes(exp.sizeBytes ?? 0)}
          </Text>
        </View>
        <InlineAlert message={error} />
        <PrimaryButton label={folder ? `Save to ${folder}` : 'Save to phone'} isLoading={saving} onPress={() => void save()} />
        {folder ? (
          <Pressable onPress={() => void save(true)} disabled={saving} accessibilityRole="button" className="self-center rounded-full px-3 py-1.5 active:bg-default">
            <Text className="text-[14px] font-medium text-accent">Choose another folder</Text>
          </Pressable>
        ) : (
          <Text variant="caption" className="text-center">You&apos;ll pick a folder once; later MP3s go there too.</Text>
        )}
      </View>
    );
  }

  // Nothing yet, out of date, or failed
  return (
    <View className="gap-4">
      <Text className="text-[15px] leading-[23px] text-muted">
        {exp.status === 'READY' && !exp.upToDate
          ? 'The audio has changed since the last MP3 (voice or emotions). Make a fresh one to include the changes.'
          : 'The whole recording as one MP3. Parts you haven’t listened to yet are voiced first and count towards this month’s listening.'}
      </Text>
      <InlineAlert
        message={error ?? (exp.status === 'FAILED' ? exp.error : null)}
        action={outOfMinutes ? <PrimaryButton label="See plans" size="md" variant="secondary" onPress={() => router.push('/plans')} /> : undefined}
      />
      <PrimaryButton label={exp.status === 'FAILED' ? 'Try again' : 'Prepare MP3'} isLoading={starting} onPress={() => void start()} />
    </View>
  );
}

/** Standalone sheet (the player menu); the shelf shows the panel inside its own sheet */
export function ExportSheet({ document, onClose }: { document: DocumentSummary | null; onClose: () => void }) {
  return (
    <ActionSheet visible={!!document} onClose={onClose} title="Download MP3">
      {document ? <ExportPanel document={document} /> : null}
    </ActionSheet>
  );
}
