import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { Text } from '@/components/ui/text';

import { useBannerAllowed } from '../hooks';
import { AD_UNITS } from '../lib/ads-sdk';

/** The banner itself; only loaded in builds that have the ads SDK (see shelf-banner.tsx) */
export default function ShelfBannerAd() {
  const allowed = useBannerAllowed();
  const [failed, setFailed] = useState(false);
  if (!allowed || failed || !AD_UNITS.banner) return null;

  return (
    <View className="gap-1.5 px-5 py-3">
      <BannerAd unitId={AD_UNITS.banner} size={BannerAdSize.INLINE_ADAPTIVE_BANNER} maxHeight={100} onAdFailedToLoad={() => setFailed(true)} />
      <Pressable onPress={() => router.push('/plans')} accessibilityRole="link" hitSlop={6} className="self-start">
        <Text variant="caption">Ad · No ads with Plus</Text>
      </Pressable>
    </View>
  );
}
