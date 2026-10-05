import { useQueryClient } from '@tanstack/react-query';
import { useToast } from 'heroui-native';
import { useEffect, useRef } from 'react';
import { useRewardedAd } from 'react-native-google-mobile-ads';

import { useAuthStore } from '@/features/auth/store/auth.store';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';

import { adsKey, useAdsStatus, useClaimReward } from '../hooks';
import { AD_UNITS, useAdsSdk } from '../lib/ads-sdk';

// AdMob's server callback usually arrives within a few seconds of the reward
const SERVER_REWARD_DELAY_MS = 4000;

/** Keeps one rewarded ad loaded and grants its minutes; only loaded in builds that have the ads SDK */
export default function RewardedAdLoader() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const status = useAdsStatus().data;
  const { ready, canRequestAds } = useAdsSdk();
  const claim = useClaimReward();
  const enabled = !!status?.showAds && status.reward.leftToday > 0 && ready && canRequestAds && !!AD_UNITS.rewarded;

  const ad = useRewardedAd({
    adUnitId: AD_UNITS.rewarded,
    autoLoad: enabled,
    // Lets AdMob tell the server who earned the reward (server-side verification)
    requestOptions: { serverSideVerificationOptions: userId ? { userId } : undefined },
  });

  const loaded = enabled && ad.status === 'loaded';
  const show = ad.show;
  useEffect(() => {
    useAdsSdk.setState({ rewardReady: loaded, showReward: loaded ? () => show() : null });
  }, [loaded, show]);

  const granted = useRef(false);
  useEffect(() => {
    if (!ad.earnedReward || granted.current || !status) return;
    granted.current = true;
    const minutes = status.reward.minutes;
    void (async () => {
      try {
        if (status.reward.verifiedByServer) {
          await new Promise((r) => setTimeout(r, SERVER_REWARD_DELAY_MS));
          await Promise.all([queryClient.invalidateQueries({ queryKey: ['usage'] }), queryClient.invalidateQueries({ queryKey: adsKey })]);
        } else {
          await claim.mutateAsync();
        }
        haptics.success();
        toast.show({ variant: 'success', label: `${minutes} more Natural minutes added. Pick a Natural voice to use them.` });
      } catch (e) {
        toast.show({ variant: 'danger', label: getErrorMessage(e) });
      }
    })();
  }, [ad.earnedReward, status, claim, queryClient, toast]);

  // Ready the next one after this one closes
  const load = ad.load;
  useEffect(() => {
    if (ad.status !== 'closed') return;
    granted.current = false;
    if (enabled) load();
  }, [ad.status, enabled, load]);

  return null;
}
