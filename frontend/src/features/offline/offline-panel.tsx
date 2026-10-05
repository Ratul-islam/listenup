import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { CircleCheck } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import type { DocumentSummary } from '@/features/library/types';
import { useUsage } from '@/features/voices/hooks/use-voices';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { downloadForOffline } from './offline-download';
import { offlineFiles, useOfflineStore } from './offline-files';

export const megabytes = (bytes: number) => `${Math.max(bytes / 1_000_000, 0.1).toFixed(1)} MB`;

/** "Download for offline" for one document: Plus and Pro */
export function OfflinePanel({ document }: { document: DocumentSummary }) {
  const t = useTokens();
  const { toast } = useToast();
  const usage = useUsage();
  const saved = useOfflineStore((s) => s.downloads[document.id]);
  const progress = useOfflineStore((s) => s.progress[document.id]);
  const [error, setError] = useState<string | null>(null);
  const [needsPlan, setNeedsPlan] = useState(false);
  const premium = usage.data ? usage.data.plan.id !== 'free' : null;

  const download = () => {
    setError(null);
    setNeedsPlan(false);
    downloadForOffline(document)
      .then(() => {
        haptics.success();
        toast.show({ variant: 'success', label: 'Downloaded', description: `${document.title} plays without a connection now.` });
      })
      .catch((e) => {
        haptics.error();
        setError(getErrorMessage(e));
        setNeedsPlan(hasErrorCode(e, 'PREMIUM_REQUIRED', 'USAGE_LIMIT_REACHED'));
      });
  };

  if (premium === null) return <Spinner color={t.accent} className="my-6 self-center" />;

  if (!premium && !saved) {
    return (
      <View className="gap-4">
        <Text className="text-[15px] leading-[23px] text-muted">
          Save a document on your phone and listen with no connection, on a plane or to save data. Offline listening is part of Plus and Pro.
          Phone voices already work offline on every plan.
        </Text>
        <PrimaryButton label="See plans" onPress={() => router.push('/plans')} />
      </View>
    );
  }

  if (progress) {
    const preparing = progress.phase === 'preparing';
    return (
      <View className="gap-3">
        <Text className="text-[16px] font-semibold">
          {preparing
            ? `Voicing part ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
            : `Downloading ${progress.done} of ${progress.total}…`}
        </Text>
        <ProgressBar value={progress.done / Math.max(progress.total, 1)} />
        <Text variant="caption">Keep ListenUp open until it finishes.</Text>
      </View>
    );
  }

  if (saved) {
    return (
      <View className="gap-4">
        <View className="flex-row items-center gap-3">
          <CircleCheck size={20} color={t.accent} />
          <Text className="flex-1 text-[16px] font-semibold">Downloaded, {megabytes(saved.sizeBytes)}</Text>
        </View>
        <Text variant="caption">
          It plays without a connection. If you change its voice or emotions, those parts stream until you download it again.
        </Text>
        <PrimaryButton label="Download again" size="md" variant="secondary" onPress={download} />
        <PrimaryButton label="Remove download" size="md" variant="secondary" onPress={() => offlineFiles.remove(document.id)} />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <Text className="text-[15px] leading-[23px] text-muted">
        Save this document on your phone to listen with no connection. Parts you haven’t listened to yet are voiced first and count towards this
        month’s minutes.
      </Text>
      <InlineAlert
        message={error}
        action={needsPlan ? <PrimaryButton label="See plans" size="md" variant="secondary" onPress={() => router.push('/plans')} /> : undefined}
      />
      <PrimaryButton label="Download" onPress={download} />
    </View>
  );
}
