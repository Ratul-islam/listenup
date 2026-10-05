import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuthStore } from '@/features/auth/store/auth.store';
import { userApi } from '@/features/user/api/user.api';

import { billingApi } from '../api/billing.api';
import { activeSubscription, identifyPurchaser, loadPlanPackages, loadStudioPacks, purchasesAvailable } from '../lib/purchases';

/** Ties Google Play purchases to the signed-in account */
export function usePurchaserIdentity() {
  const userId = useAuthStore((s) => s.user?.id);
  useEffect(() => {
    if (userId) void identifyPurchaser(userId).catch(() => {});
  }, [userId]);
}

export function usePlanPackages() {
  return useQuery({ queryKey: ['store', 'plans'], queryFn: loadPlanPackages, enabled: purchasesAvailable, staleTime: 10 * 60_000, retry: 1 });
}

export function useActiveSubscription() {
  return useQuery({ queryKey: ['store', 'active'], queryFn: activeSubscription, enabled: purchasesAvailable, retry: 1 });
}

export function useStudioPacks() {
  return useQuery({ queryKey: ['store', 'studio-packs'], queryFn: loadStudioPacks, enabled: purchasesAvailable, staleTime: 10 * 60_000, retry: 1 });
}

/**
 * Runs a store action (buy, restore), then has the server apply the result at
 * once and refreshes everything that shows the plan or minutes.
 */
export function useStoreAction() {
  const client = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: async (action: () => Promise<unknown>) => {
      await action();
      return billingApi.sync();
    },
    onSuccess: async () => {
      await Promise.all([['usage'], ['plans'], ['store', 'active']].map((queryKey) => client.invalidateQueries({ queryKey })));
      userApi.me().then(setUser).catch(() => {});
    },
  });
}
