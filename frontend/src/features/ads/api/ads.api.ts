import { api } from '@/lib/api/client';

export interface AdsStatus {
  /** Free plan: the shelf banner and rewarded ads */
  showAds: boolean;
  reward: {
    /** Natural minutes one rewarded ad adds */
    minutes: number;
    perDay: number;
    leftToday: number;
    /** AdMob tells the server about rewards itself; the app doesn't report them */
    verifiedByServer: boolean;
  };
}

export const adsApi = {
  status: () => api.get<AdsStatus>('/ads', { auth: true }).then((r) => r.data),
  /** Reports a watched rewarded ad (only while the server isn't verifying them with AdMob) */
  claim: () => api.post<AdsStatus>('/ads/rewards', undefined, { auth: true }).then((r) => r.data),
};
