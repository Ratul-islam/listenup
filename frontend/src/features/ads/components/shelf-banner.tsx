import { lazy, Suspense } from 'react';

import { adsAvailable } from '../lib/ads-sdk';

// Loaded on demand: importing the ads SDK crashes builds that don't include it
const ShelfBannerAd = lazy(() => import('./shelf-banner-ad'));

/** The Free plan's one ad: a small banner among the shelf's items */
export function ShelfBanner() {
  if (!adsAvailable) return null;
  return (
    <Suspense fallback={null}>
      <ShelfBannerAd />
    </Suspense>
  );
}
