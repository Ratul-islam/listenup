import type { User } from '@/features/auth/types';
import { api } from '@/lib/api/client';

export interface PlanInfo {
  id: string;
  name: string;
  price: string | null;
  monthlyHours: number;
  perks: string[];
  purchasable: boolean;
}

export const accountApi = {
  updateProfile: (body: { name: string }) => api.patch<{ user: User }>('/users/me', body, { auth: true }).then((r) => r.data.user),
  /** Closes the account; it's erased after the grace period unless the user signs back in */
  close: () => api.delete<{ deleteAfter: string }>('/users/me', { auth: true }).then((r) => r.data),
  plans: () => api.get<{ current: string; plans: PlanInfo[] }>('/plans', { auth: true }).then((r) => r.data),
};
