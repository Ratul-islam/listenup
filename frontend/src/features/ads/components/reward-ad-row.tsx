import { PlayCircle } from 'lucide-react-native';

import { SettingsRow } from '@/components/ui/settings';
import { useTokens } from '@/lib/use-tokens';

import { useAdsStatus } from '../hooks';
import { AD_UNITS, useAdsSdk } from '../lib/ads-sdk';

/** "Watch an ad for 10 more minutes" (Free plan), while today's rewards last */
export function RewardAdRow() {
  const t = useTokens();
  const status = useAdsStatus().data;
  const { ready, canRequestAds, rewardReady, showReward } = useAdsSdk();
  if (!status?.showAds || !ready || !canRequestAds || !AD_UNITS.rewarded) return null;

  const { minutes, leftToday, perDay } = status.reward;
  if (leftToday <= 0) {
    return <SettingsRow icon={<PlayCircle size={19} color={t.muted} />} label={`More ad minutes tomorrow`} detail={`You've watched today's ${perDay}.`} />;
  }
  return (
    <SettingsRow
      icon={<PlayCircle size={19} color={t.foreground} />}
      label={`Watch an ad for ${minutes} more minutes`}
      detail={rewardReady ? `Natural voices · ${leftToday} left today` : 'Getting an ad ready…'}
      onPress={rewardReady && showReward ? showReward : undefined}
    />
  );
}
