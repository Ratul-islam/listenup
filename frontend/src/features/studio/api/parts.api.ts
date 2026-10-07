import type { DocumentSummary, ReaderChunk } from '@/features/library/types';
import { api } from '@/lib/api/client';

/** A part as the server returns it after a change */
export type Part = Omit<ReaderChunk, 'durationMs'>;

export interface PartSettings {
  voiceId?: string | null;
  pauseAfterMs?: number;
  locked?: boolean;
}

export interface ReplaceResult {
  matches: number;
  /** Parts that would change (or did) */
  parts: number[];
  /** Locked parts with a match, left alone */
  lockedParts: number[];
  /** Roughly how much voicing the changed parts need */
  secondsToVoice: number;
  document?: DocumentSummary | null;
}

/**
 * A script's parts. Each keeps its own audio, so changing, adding, removing
 * or re-taking one voices only that part again.
 */
export const partsApi = {
  /** New words for one part; longer text becomes several parts */
  edit: (documentId: string, index: number, text: string) =>
    api.patch<{ document: DocumentSummary; parts: Part[] }>(`/documents/${documentId}/parts/${index}`, { text }, { auth: true }).then((r) => r.data),
  /** New text after part `after` (-1 for the very start) */
  insert: (documentId: string, after: number, text: string) =>
    api.post<{ document: DocumentSummary; parts: Part[] }>(`/documents/${documentId}/parts`, { after, text }, { auth: true }).then((r) => r.data),
  remove: (documentId: string, index: number) =>
    api.delete<{ document: DocumentSummary }>(`/documents/${documentId}/parts/${index}`, { auth: true }).then((r) => r.data),
  /** Records the same words again the next time the part plays */
  retake: (documentId: string, index: number) =>
    api.post<{ parts: Part[]; secondsToVoice: number }>(`/documents/${documentId}/parts/${index}/retake`, undefined, { auth: true }).then((r) => r.data),

  /** Records one sentence again on its own and splices it in; only that sentence costs minutes */
  retakeSentence: (documentId: string, index: number, sentence: number) =>
    api
      .post<{ parts: Part[]; secondsToVoice: number }>(`/documents/${documentId}/parts/${index}/sentences/${sentence}/retake`, undefined, { auth: true })
      .then((r) => r.data),

  /** A part's own voice (null: the script's), the pause after it, and its lock */
  settings: (documentId: string, index: number, body: PartSettings) =>
    api.patch<{ document: DocumentSummary; parts: Part[] }>(`/documents/${documentId}/parts/${index}`, body, { auth: true }).then((r) => r.data),

  /** Find and replace; without `apply` it only reports what would change and roughly what it costs */
  replace: (documentId: string, body: { find: string; replace: string; matchCase?: boolean; wholeWord?: boolean; apply?: boolean }) =>
    api.post<ReplaceResult>(`/documents/${documentId}/replace`, body, { auth: true }).then((r) => r.data),
};
