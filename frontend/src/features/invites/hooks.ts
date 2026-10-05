import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireOptionalNativeModule } from 'expo';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { invitesApi } from './api/invites.api';

export const invitesKey = ['invites'] as const;
const REFERRER_CHECKED_KEY = 'invite-referrer-checked';

export function useInvites() {
  return useQuery({ queryKey: invitesKey, queryFn: invitesApi.overview });
}

export function useRedeemInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invitesApi.redeem,
    onSuccess: (data) => {
      queryClient.setQueryData(invitesKey, data);
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
  });
}

/** "invite=ABC123" from the Play install referrer, if the app was installed from an invite link */
async function referrerCode() {
  // Builds made before invites were added don't have this module
  if (!requireOptionalNativeModule('ExpoApplication')) return null;
  const Application = await import('expo-application');
  const referrer = await Application.getInstallReferrerAsync();
  return new URLSearchParams(decodeURIComponent(referrer)).get('invite');
}

/**
 * Applies a friend's code automatically when the app was installed from their
 * invite link. Runs once per install, after sign-in.
 */
export function useInstallReferrerInvite() {
  const redeem = useRedeemInvite();
  const { mutate } = redeem;
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void (async () => {
      if (await SecureStore.getItemAsync(REFERRER_CHECKED_KEY)) return;
      if (!requireOptionalNativeModule('ExpoApplication')) return;
      const code = await referrerCode().catch(() => null);
      if (code) {
        const overview = await invitesApi.overview().catch(() => null);
        if (overview?.canRedeem) mutate(code);
      }
      await SecureStore.setItemAsync(REFERRER_CHECKED_KEY, '1');
    })();
  }, [mutate]);
}
