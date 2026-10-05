import { router } from 'expo-router';
import { useToast } from 'heroui-native';
import { useEffect } from 'react';

import { useAdsSdk } from '@/features/ads/lib/ads-sdk';

import { usePlayerStore } from '../store/player.store';

/** Shows the player's one-off messages (e.g. "switched to your phone's voice") as toasts */
export function PlayerNotices() {
  const { toast } = useToast();
  const notice = usePlayerStore((s) => s.notice);

  useEffect(() => {
    if (!notice) return;
    const { showReward } = useAdsSdk.getState();
    toast.show({
      label: notice.message,
      ...(notice.offerAd && showReward
        ? {
            actionLabel: 'Watch an ad',
            onActionPress: ({ hide }) => {
              hide('all');
              showReward();
            },
          }
        : notice.showPlans && {
            actionLabel: 'See plans',
            onActionPress: ({ hide }) => {
              hide('all');
              router.push('/plans');
            },
          }),
    });
    usePlayerStore.setState({ notice: null });
  }, [notice, toast]);

  return null;
}
