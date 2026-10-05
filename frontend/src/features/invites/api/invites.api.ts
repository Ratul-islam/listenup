import { api } from '@/lib/api/client';

export interface InviteOverview {
  code: string;
  /** Google Play link that hands the code to the app on first launch */
  link: string;
  minutesEach: number;
  maxRewards: number;
  /** Friends who qualified, and friends who signed up but haven't yet */
  rewarded: number;
  pending: number;
  invitedBy: { name: string | null; rewarded: boolean } | null;
  /** This account can still enter a friend's code */
  canRedeem: boolean;
  listenMinutesNeeded: number;
}

export const invitesApi = {
  overview: () => api.get<InviteOverview>('/invites', { auth: true }).then((r) => r.data),
  redeem: (code: string) => api.post<InviteOverview>('/invites/redeem', { code }, { auth: true }).then((r) => r.data),
};
