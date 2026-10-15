import type { DocumentSummary } from '@/features/library/types';
import { api } from '@/lib/api/client';
import type { Lang } from '@/lib/languages';

export type PublicationStatus = 'CHECKING' | 'LIVE' | 'HIDDEN' | 'REJECTED' | 'REMOVED' | 'FAILED';
export type ReportReason = 'spam' | 'hate' | 'sexual' | 'violence' | 'copied' | 'private' | 'other';
export type Board = 'bn' | 'en' | 'other';

/** A writing or voice clip in Explore's Community */
export interface CommunityItem {
  id: string;
  kind: 'writing' | 'clip';
  title: string;
  language: Lang | 'mixed';
  excerpt: string;
  /** A clip's words */
  text: string | null;
  /** Who wrote a quoted clip (a classic's author); null when it's the publisher's own */
  credit: string | null;
  durationSec: number;
  voiceId: string;
  /** The cover picture its writer chose (a link that lasts a day); null for the drawn cover */
  coverUrl?: string | null;
  penName: string;
  hearts: number;
  listens: number;
  publishedAt: string | null;
  /** "YYYY-MM" when it's a contest entry */
  contestMonth: string | null;
  mine: boolean;
  hearted: boolean;
  /** The listener's copy on their shelf, once added */
  documentId: string | null;
  /** Only on the writer's own */
  status?: PublicationStatus;
  statusNote?: string | null;
  createdAt?: string;
}

/** One item in full: also how much longer to listen before hearting (null for your own) */
export interface CommunityDetail extends CommunityItem {
  heartAfterSec: number | null;
}

export interface CommunityProfile {
  penName: string | null;
  rulesAccepted: boolean;
  isAdmin: boolean;
}

export interface ContestEntrySummary {
  month: string;
  theme: string | null;
  endsAt: string;
  prizeMinutes: number[];
  entry: CommunityItem | null;
}

export interface PublishPreview {
  canPublish: boolean;
  /** Why it can't be published */
  reason: string | null;
  penName: string | null;
  title: string;
  contest: ContestEntrySummary;
  /** Already in Explore (or on its way) from this document */
  existing: { id: string; status: PublicationStatus; title: string } | null;
  voiceId?: string;
  language?: Lang;
  charCount?: number;
  durationSec?: number;
  /** Seconds still to voice, from the writer's minutes */
  toVoice?: { natural: number; expressive: number };
}

export interface Leader {
  id: string;
  title: string;
  penName: string;
  place: number;
  /** Hearts that count in the contest */
  hearts: number;
  mine: boolean;
}

export interface ContestView {
  month: string;
  theme: string | null;
  endsAt: string;
  prizeMinutes: number[];
  minHearts: number;
  voterMinDays: number;
  boards: { id: Board; leaders: Leader[] }[];
  entry: CommunityItem | null;
  lastMonth: {
    month: string;
    theme: string | null;
    winners: { board: Board; place: number; title: string; penName: string; hearts: number; minutes: number; publicationId: string | null }[];
  } | null;
  /** Prizes the viewer won and hasn't seen yet */
  wins: { id: string; month: string; board: Board; place: number; title: string; minutes: number }[];
}

export interface ReviewItem {
  id: string;
  coverUrl?: string | null;
  kind: 'writing' | 'clip';
  status: PublicationStatus;
  statusNote: string | null;
  title: string;
  language: string;
  penName: string | null;
  email: string;
  text: string;
  reports: { reason: ReportReason; note: string | null; createdAt: string }[];
  updatedAt: string;
}

export type PublishBody =
  | { kind: 'writing'; documentId: string; title: string; voiceId: string; contest: boolean; penName?: string; ownWork: true; /** The cover picture, as base64 */ cover?: string }
  | { kind: 'clip'; documentId: string; chunkIndex: number; start: number; end: number; voiceId?: string; penName?: string };

const auth = { auth: true } as const;

export const communityApi = {
  feed: (kind: 'writing' | 'clip', cursor?: string) =>
    api
      .get<{ items: CommunityItem[]; next: string | null }>(`/community?kind=${kind}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, auth)
      .then((r) => r.data),
  get: (id: string) => api.get<{ item: CommunityDetail }>(`/community/${id}`, auth).then((r) => r.data.item),
  mine: () => api.get<{ items: CommunityItem[] }>('/community/mine', auth).then((r) => r.data.items),
  profile: () => api.get<CommunityProfile>('/community/profile', auth).then((r) => r.data),
  setPenName: (penName: string) => api.put<CommunityProfile>('/community/profile', { penName }, auth).then((r) => r.data),
  preview: (documentId: string, voiceId?: string) =>
    api.get<PublishPreview>(`/community/preview?documentId=${documentId}${voiceId ? `&voiceId=${voiceId}` : ''}`, auth).then((r) => r.data),
  // A clip is voiced while you wait, and a writing may carry its cover picture
  publish: (body: PublishBody) => api.post<{ item: CommunityItem }>('/community', body, { ...auth, timeoutMs: 90_000 }).then((r) => r.data.item),
  unpublish: (id: string) => api.delete<null>(`/community/${id}`, auth),
  retry: (id: string) => api.post<{ item: CommunityItem }>(`/community/${id}/retry`, undefined, auth).then((r) => r.data.item),
  heart: (id: string) => api.put<{ hearts: number }>(`/community/${id}/heart`, undefined, auth).then((r) => r.data),
  unheart: (id: string) => api.delete<{ hearts: number }>(`/community/${id}/heart`, auth).then((r) => r.data),
  report: (id: string, reason: ReportReason, note?: string) => api.post<null>(`/community/${id}/report`, { reason, note }, auth),
  blockWriter: (id: string) => api.post<null>(`/community/${id}/block`, undefined, auth),
  blocks: () => api.get<{ items: { userId: string; penName: string; blockedAt: string }[] }>('/community/blocks', auth).then((r) => r.data.items),
  unblock: (userId: string) => api.delete<null>(`/community/blocks/${userId}`, auth),
  clipAudio: (id: string) => api.get<{ url: string; durationMs: number; mimeType: string }>(`/community/${id}/audio`, auth).then((r) => r.data),
  /** Puts a writing on the shelf; adding it again returns the same document */
  add: (id: string) => api.post<{ document: DocumentSummary }>('/documents', { from: 'community', id }, auth).then((r) => r.data.document),
  contest: () => api.get<ContestView>('/community/contest', auth).then((r) => r.data),
  winsSeen: () => api.post<null>('/community/contest/wins/seen', undefined, auth),
  reviewQueue: () => api.get<{ items: ReviewItem[] }>('/community/review', auth).then((r) => r.data.items),
  review: (id: string, action: 'restore' | 'remove', note?: string) => api.post<null>(`/community/review/${id}`, { action, note }, auth),
  setTheme: (month: string, theme: string | null) => api.put<{ month: string; theme: string | null }>(`/community/contests/${month}/theme`, { theme }, auth).then((r) => r.data),
};
