import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Copy, Podcast, RefreshCw, Share2, X } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenHeader, SettingsRow, SettingsSection } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import type { PodcastEpisode } from '../api/podcast.api';
import { usePodcast, useRemoveFromPodcast, useResetPodcastLink } from '../hooks';

const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60_000))} min`;

const episodeStatus = (e: PodcastEpisode) =>
  e.status === 'RUNNING'
    ? `Preparing… ${e.chunkCount ? Math.round((e.chunksDone / e.chunkCount) * 100) : 0}%`
    : e.status === 'FAILED'
      ? (e.error ?? "Couldn't prepare it. Add it again to retry.")
      : e.durationMs
        ? `In your feed · ${minutes(e.durationMs)}`
        : 'In your feed';

/** "Private podcast" (Plus and Pro): the feed address for podcast apps, and what's in it */
export default function PodcastScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { toast } = useToast();
  const { data } = usePodcast();
  const remove = useRemoveFromPodcast();
  const reset = useResetPodcastLink();
  const fail = (e: unknown) => toast.show({ variant: 'danger', label: getErrorMessage(e) });

  const copy = async () => {
    if (!data?.feedUrl) return;
    await Clipboard.setStringAsync(data.feedUrl);
    haptics.success();
    toast.show({ label: 'Feed link copied', description: 'Paste it into your podcast app’s “Add by URL” or “RSS” option.' });
  };

  const confirmReset = () =>
    Alert.alert('Make a new link?', 'Podcast apps using the old link stop getting episodes. Add the new link to them again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'New link', style: 'destructive', onPress: () => reset.mutate(undefined, { onError: fail, onSuccess: () => toast.show({ label: 'New link made' }) }) },
    ]);

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 20 }}>
        <ScreenHeader title="Private podcast" onBack={router.back} />

        {!data ? (
          <Spinner color={t.accent} />
        ) : !data.enabled ? (
          <GlassCard className="items-center gap-4 p-6">
            <View className="size-14 items-center justify-center rounded-full bg-accent-soft-bg">
              <Podcast size={26} color={t.accent} />
            </View>
            <Text variant="h2" className="text-center">Your documents, in any podcast app</Text>
            <Text variant="lead" className="text-center">
              With Plus, documents you pick become episodes in a private feed, so you can listen in your favourite podcast app or in the car.
            </Text>
            <PrimaryButton label="See Plus" onPress={() => router.push('/plans')} />
          </GlassCard>
        ) : (
          <>
            <GlassCard className="gap-4 p-5">
              <Text variant="lead">
                Add this link to your podcast app (look for “Add by URL” or “RSS”). Keep it to yourself: anyone with it can listen.
              </Text>
              <Text selectable numberOfLines={2} className="font-mono text-[13px] text-muted">{data.feedUrl}</Text>
              <View className="gap-2.5">
                <PrimaryButton label="Copy feed link" icon={<Copy size={18} color={t.accentForeground} />} onPress={() => void copy()} />
                <PrimaryButton
                  label="Share link"
                  variant="secondary"
                  icon={<Share2 size={18} color={t.foreground} />}
                  onPress={() => data.feedUrl && void Share.share({ message: data.feedUrl })}
                />
              </View>
            </GlassCard>

            <SettingsSection
              title="Episodes"
              footer="Add documents from their ⋯ menu. New audio uses your minutes, like downloads do. Episodes use the voice you picked when you added them."
            >
              {data.episodes.length ? (
                data.episodes.map((e) => (
                  <View key={e.documentId} className="flex-row items-center gap-3 p-3">
                    <View className="flex-1 gap-0.5">
                      <Text className="text-[16px] font-medium" numberOfLines={2}>{e.title}</Text>
                      <Text variant="caption" className={e.status === 'FAILED' ? 'text-danger' : ''}>{episodeStatus(e)}</Text>
                    </View>
                    {e.status === 'RUNNING' ? <Spinner size="sm" color={t.accent} /> : null}
                    <Pressable
                      onPress={() => remove.mutate(e.documentId, { onError: fail })}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${e.title} from your podcast`}
                      className="size-9 items-center justify-center rounded-full active:bg-default"
                    >
                      <X size={18} color={t.muted} />
                    </Pressable>
                  </View>
                ))
              ) : (
                <Text variant="caption" className="p-3">Nothing yet. Open a document’s ⋯ menu and choose “Add to podcast”.</Text>
              )}
            </SettingsSection>

            <SettingsSection>
              <SettingsRow icon={<RefreshCw size={19} color={t.foreground} />} label="Make a new link" detail="Turns the old link off" onPress={confirmReset} />
            </SettingsSection>
          </>
        )}
      </ScrollView>
    </CloudBackground>
  );
}
