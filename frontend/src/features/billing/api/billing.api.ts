import { api } from '@/lib/api/client';

export interface BillingState {
  plan: string;
  planExpiresAt: string | null;
  planRenews: boolean;
  bonusExpressiveSec: number;
}

export const billingApi = {
  /** Applies the account's Google Play purchases now, without waiting for RevenueCat's webhook */
  sync: () => api.post<BillingState>('/billing/sync', {}, { auth: true }).then((r) => r.data),
};
