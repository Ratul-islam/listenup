import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Spinner, Switch } from 'heroui-native';
import { CircleCheck, Gauge, Leaf } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { IconTile } from '@/components/ui/icon-tile';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ScreenHeader, SettingsRow, SettingsSection } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { megabytes } from '@/features/offline/offline-panel';
import { voicesApi } from '@/features/voices/api/voices.api';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { isFastEnough, isOnDeviceActive, onDeviceVoice, useOnDeviceStore } from '../on-device-voice';

export const onDeviceModelKey = ['on-device-model'] as const;

/** How many seconds of speech the phone makes per second: "3.1×" */
export const speedLabel = (rtf: number) => `${(1 / rtf).toFixed(1)}×`;

/** Download Natural voices to the phone, where they're free, unlimited and offline */
export default function NaturalVoicesScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const state = useOnDeviceStore();
  const model = useQuery({ queryKey: onDeviceModelKey, queryFn: voicesApi.onDeviceModel, staleTime: 10 * 60_000 });
  const { status, progress, checking, error } = state;
  const offered = model.data?.available ? model.data : null;
  const update = status.installed && offered && status.version !== null && offered.version > status.version;

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 18 }}>
        <ScreenHeader title="Natural voices" onBack={router.back} />
        {/* A long press opens the test screen (speed by thread count, every voice) */}
        <Pressable onLongPress={() => (haptics.tap(), router.push('/kokoro-lab'))} delayLongPress={1500}>
          <Text variant="lead">
            Download them once and your phone makes them itself: free, unlimited, and they work with no connection.
          </Text>
        </Pressable>

        {!onDeviceVoice.isSupported ? (
          <GlassCard className="p-4">
            <Text className="text-[15px] leading-[23px] text-muted">This device can’t run Natural voices itself. They come from ListenUp’s servers.</Text>
          </GlassCard>
        ) : progress ? (
          <DownloadProgress />
        ) : checking ? (
          <GlassCard className="flex-row items-center gap-3 p-4">
            <Spinner />
            <Text className="flex-1 text-[16px] font-semibold">Testing how fast your phone speaks…</Text>
          </GlassCard>
        ) : status.installed ? (
          <Installed />
        ) : (
          <GlassCard className="gap-4 p-4">
            <View className="flex-row items-center gap-3">
              <IconTile size={44}>
                <Leaf size={20} color={t.accent} />
              </IconTile>
              <View className="flex-1">
                <Text className="text-[16px] font-semibold">{offered ? `${megabytes(offered.bytes)} download` : 'Natural voices'}</Text>
                <Text variant="caption">{offered ? `Uses about ${megabytes(offered.unpackedBytes)} on your phone` : ' '}</Text>
              </View>
            </View>
            <Languages />
            {model.isPending ? (
              <Spinner className="self-center" />
            ) : offered ? (
              <>
                <PrimaryButton label="Download" onPress={() => (haptics.tap(), void onDeviceVoice.install())} />
                <Text variant="caption">Use Wi‑Fi if you can. You can pause and carry on later.</Text>
              </>
            ) : (
              <Text variant="caption">They aren’t ready to download yet. Until then, Natural voices come from ListenUp’s servers.</Text>
            )}
          </GlassCard>
        )}

        <InlineAlert message={error} />

        {update ? (
          <PrimaryButton label={`Update voices (${megabytes(offered.bytes)})`} variant="secondary" onPress={() => void onDeviceVoice.install()} />
        ) : null}

        {status.installed && !progress && !checking ? <Manage /> : null}
      </ScrollView>
    </CloudBackground>
  );
}

function Languages() {
  return (
    <Text className="text-[15px] leading-[23px] text-muted">
      English (American, British and Indian), Hindi, Spanish, Portuguese, French, Italian and Chinese. Japanese voices and the Expressive ones still
      come from ListenUp’s servers.
    </Text>
  );
}

function DownloadProgress() {
  const progress = useOnDeviceStore((s) => s.progress)!;
  const label =
    progress.phase === 'downloading'
      ? progress.total
        ? `Downloading ${megabytes(progress.done)} of ${megabytes(progress.total)}`
        : 'Starting the download…'
      : progress.phase === 'verifying'
        ? 'Checking the download…'
        : `Installing… ${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%`;
  return (
    <GlassCard className="gap-3 p-4">
      <Text className="text-[16px] font-semibold">{label}</Text>
      <ProgressBar value={progress.phase === 'verifying' ? 1 : progress.done / Math.max(progress.total, 1)} />
      {progress.phase === 'downloading' ? (
        <>
          <Text variant="caption">Keep ListenUp open until it finishes.</Text>
          <PrimaryButton label="Pause" size="md" variant="secondary" onPress={onDeviceVoice.pause} />
        </>
      ) : null}
    </GlassCard>
  );
}

/** What the speed check found, and the switches */
function Installed() {
  const t = useTokens();
  const state = useOnDeviceStore();
  const { benchmark, enabled, useAnyway } = state;
  const active = isOnDeviceActive(state);
  const fast = isFastEnough(state);

  const headline = !enabled
    ? 'Switched off'
    : active
      ? 'Free and unlimited on this phone'
      : benchmark
        ? 'Your phone is a bit slow for these voices'
        : 'Ready for a speed test';
  const detail = !benchmark
    ? 'A quick test decides whether your phone can keep up while you listen.'
    : fast
      ? `It speaks ${speedLabel(benchmark.rtf)} faster than real time.`
      : `It speaks at ${speedLabel(benchmark.rtf)} real time, not quite fast enough to keep up, so listening could pause between parts. ${
          useAnyway ? 'You chose to use it anyway.' : 'Natural voices come from ListenUp’s servers instead and use your monthly minutes.'
        }`;

  return (
    <GlassCard className="gap-3 p-4">
      <View className="flex-row items-center gap-3">
        {active ? <CircleCheck size={22} color={t.accent} /> : <Gauge size={22} color={t.muted} />}
        <Text className="flex-1 text-[16px] font-semibold">{headline}</Text>
      </View>
      <Text className="text-[15px] leading-[23px] text-muted">{detail}</Text>
      {!benchmark ? <PrimaryButton label="Test speed" onPress={() => void onDeviceVoice.checkSpeed()} /> : null}
    </GlassCard>
  );
}

function Manage() {
  const { enabled, useAnyway, benchmark, status } = useOnDeviceStore();
  const slow = !!benchmark && !isFastEnough(useOnDeviceStore.getState());
  const remove = () =>
    Alert.alert('Remove Natural voices from this phone?', 'They’ll come from ListenUp’s servers again and use your monthly minutes.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void onDeviceVoice.remove() },
    ]);

  return (
    <SettingsSection footer={status.version ? `Voice package ${status.version}` : undefined}>
      <SettingsRow
        label="Use on this phone"
        detail="Off: Natural voices come from ListenUp’s servers."
        right={<Switch isSelected={enabled} onSelectedChange={onDeviceVoice.setEnabled} accessibilityLabel="Use Natural voices on this phone" />}
      />
      {slow && enabled ? (
        <SettingsRow
          label="Use anyway"
          detail="Free, but there may be short pauses, more so at faster speeds."
          right={<Switch isSelected={useAnyway} onSelectedChange={onDeviceVoice.setUseAnyway} accessibilityLabel="Use anyway" />}
        />
      ) : null}
      {benchmark ? <SettingsRow label="Test speed again" onPress={() => void onDeviceVoice.checkSpeed()} /> : null}
      <SettingsRow label="Remove from this phone" destructive onPress={remove} />
    </SettingsSection>
  );
}
