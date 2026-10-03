import { api } from '@/lib/api/client';

export interface ChunkAudio {
  index: number;
  voiceId: string;
  language: 'en' | 'bn';
  durationMs: number;
  mimeType: string;
  url: string;
}

export interface ListeningStats {
  todaySec: number;
  dailyGoalMinutes: number;
  goalFraction: number;
  streakDays: number;
}

export interface Bookmark {
  id: string;
  chunkIndex: number;
  offsetMs: number;
  label: string | null;
  createdAt: string;
}

/** The listener's local calendar day (YYYY-MM-DD), so streaks follow their timezone */
export const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const playbackApi = {
  audio: (documentId: string, index: number, voiceId?: string) =>
    api
      .get<ChunkAudio>(
        `/playback/${documentId}/chunks/${index}/audio${voiceId ? `?voiceId=${encodeURIComponent(voiceId)}` : ''}`,
        { auth: true, timeoutMs: 90_000 },
      )
      .then((r) => r.data),

  saveProgress: (
    documentId: string,
    body: { chunkIndex: number; offsetMs: number; voiceId?: string; speed?: number; listenedSec: number; completed?: boolean },
  ) => api.put<unknown>(`/playback/${documentId}/progress`, { ...body, day: localDay() }, { auth: true }),

  stats: () => api.get<ListeningStats>(`/playback/stats?day=${localDay()}`, { auth: true }).then((r) => r.data),

  bookmarks: (documentId: string) =>
    api.get<{ bookmarks: Bookmark[] }>(`/playback/${documentId}/bookmarks`, { auth: true }).then((r) => r.data.bookmarks),

  addBookmark: (documentId: string, body: { chunkIndex: number; offsetMs: number; label?: string }) =>
    api.post<{ bookmark: Bookmark }>(`/playback/${documentId}/bookmarks`, body, { auth: true }).then((r) => r.data.bookmark),

  removeBookmark: (documentId: string, bookmarkId: string) =>
    api.delete<null>(`/playback/${documentId}/bookmarks/${bookmarkId}`, { auth: true }),
};
