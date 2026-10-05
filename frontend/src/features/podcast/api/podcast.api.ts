import { api } from '@/lib/api/client';

export interface PodcastEpisode {
  documentId: string;
  title: string;
  addedAt: string | null;
  /** Its MP3: being made, ready, or failed */
  status: 'NONE' | 'RUNNING' | 'READY' | 'FAILED';
  /** In the feed now (an older MP3 stays while a new one is made) */
  playable: boolean;
  chunksDone: number;
  chunkCount: number;
  durationMs: number | null;
  error: string | null;
}

export interface PodcastOverview {
  /** Plus and Pro */
  enabled: boolean;
  /** Secret feed address for podcast apps */
  feedUrl: string | null;
  episodes: PodcastEpisode[];
}

export const podcastApi = {
  overview: () => api.get<{ podcast: PodcastOverview }>('/podcast', { auth: true }).then((r) => r.data.podcast),
  resetLink: () => api.post<{ podcast: PodcastOverview }>('/podcast/link/reset', undefined, { auth: true }).then((r) => r.data.podcast),
  add: (documentId: string) => api.put<{ episode: PodcastEpisode }>(`/podcast/episodes/${documentId}`, undefined, { auth: true }).then((r) => r.data.episode),
  remove: (documentId: string) => api.delete<null>(`/podcast/episodes/${documentId}`, { auth: true }),
};
