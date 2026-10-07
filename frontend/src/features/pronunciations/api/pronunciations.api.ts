import { api } from '@/lib/api/client';
import type { Lang } from '@/lib/languages';

export interface Pronunciation {
  id: string;
  word: string;
  sayAs: string;
  updatedAt: string;
}

export const pronunciationsApi = {
  list: () => api.get<{ pronunciations: Pronunciation[] }>('/pronunciations', { auth: true }).then((r) => r.data.pronunciations),
  /** Adds a word, or changes how it's said if it's already there (any case) */
  save: (body: { word: string; sayAs: string }) =>
    api.post<{ pronunciation: Pronunciation }>('/pronunciations', body, { auth: true }).then((r) => r.data.pronunciation),
  update: (id: string, body: { word?: string; sayAs?: string }) =>
    api.patch<{ pronunciation: Pronunciation }>(`/pronunciations/${id}`, body, { auth: true }).then((r) => r.data.pronunciation),
  remove: (id: string) => api.delete<null>(`/pronunciations/${id}`, { auth: true }),
  /** "Hear it" in the voice that reads that language; phone voices answer PHONE_VOICE and say it on the device */
  preview: (body: { sayAs: string; language?: Lang; voiceId?: string }) =>
    api.post<{ url: string; voiceId: string }>('/pronunciations/preview', body, { auth: true, timeoutMs: 60_000 }).then((r) => r.data),
};
