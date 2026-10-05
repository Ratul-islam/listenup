import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { adsApi } from './api/ads.api';
import { AD_UNITS, startAds, useAdsSdk } from './lib/ads-sdk';

export const adsKey = ['ads'] as const;

export function useAdsStatus() {
  return useQuery({ queryKey: adsKey, queryFn: adsApi.status, staleTime: 60_000 });
}

/** Starts ads (after consent) once the account turns out to be on Free */
export function useAdsStartup() {
  const showAds = useAdsStatus().data?.showAds;
  useEffect(() => {
    if (showAds) void startAds();
  }, [showAds]);
}

/** Whether the shelf banner can show: Free, consent given, and a banner unit in this build */
export function useBannerAllowed() {
  const showAds = useAdsStatus().data?.showAds ?? false;
  const { ready, canRequestAds } = useAdsSdk();
  return showAds && ready && canRequestAds && !!AD_UNITS.banner;
}

export function useClaimReward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adsApi.claim,
    onSuccess: (status) => queryClient.setQueryData(adsKey, status),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['usage'] }),
  });
}
