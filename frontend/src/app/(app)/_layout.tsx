import { Stack } from 'expo-router';
import { useThemeColor } from 'heroui-native';
import { useEffect } from 'react';

import { RewardedAdHost } from '@/features/ads/components/rewarded-ad-host';
import { useAdsStartup } from '@/features/ads/hooks';
import { usePurchaserIdentity } from '@/features/billing/hooks/use-store';
import { useInstallReferrerInvite } from '@/features/invites/hooks';
import { resumeDownloads } from '@/features/offline/offline-download';
import { PlayerNotices } from '@/features/player/components/player-notices';

export default function AppLayout() {
  const background = useThemeColor('background');
  usePurchaserIdentity();
  useAdsStartup();
  useInstallReferrerInvite();
  useEffect(() => {
    void resumeDownloads();
  }, []);

  return (
    <>
      <PlayerNotices />
      <RewardedAdHost />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="player" options={{ animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="import" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="share" options={{ animation: 'fade' }} />
      </Stack>
    </>
  );
}
