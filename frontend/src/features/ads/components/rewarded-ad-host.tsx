import { lazy, Suspense } from 'react';

import { adsAvailable } from '../lib/ads-sdk';

// Loaded on demand: importing the ads SDK crashes builds that don't include it
const RewardedAdLoader = lazy(() => import('./rewarded-ad-loader'));

/**
 * Keeps one rewarded ad loaded for Free users and grants its Natural minutes.
 * Mounted once; anything can show the ad through `useAdsSdk().showReward`.
 */
export function RewardedAdHost() {
  if (!adsAvailable) return null;
  return (
    <Suspense fallback={null}>
      <RewardedAdLoader />
    </Suspense>
  );
}
