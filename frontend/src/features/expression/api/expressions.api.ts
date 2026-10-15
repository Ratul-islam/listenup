import type { DocumentSummary } from '@/features/library/types';
import { api } from '@/lib/api/client';

import type { ChunkExpressions, EmotionMark, NarrationStrength, NarrationStyleId } from '../catalog';

export interface NarrationChoice {
  /** "auto" lets the AI pick; null turns the style off */
  style: NarrationStyleId | 'auto' | null;
  strength: NarrationStrength;
}

// The recording is converted and listened to by AI before the answer comes back
const FOLLOW_TIMEOUT_MS = 60_000

export const expressionsApi = {
  /** Replaces one part's emotions and sounds; only that part's audio is made again */
  setChunk: (documentId: string, index: number, expressions: ChunkExpressions) =>
    api
      .patch<{ parts: { expressions: ChunkExpressions }[] }>(`/documents/${documentId}/parts/${index}`, { expressions }, { auth: true })
      .then((r) => r.data.parts[0].expressions),

  /** "Say it like a scared child": AI turns the words into a direction for part of a chunk */
  describe: (documentId: string, index: number, body: { start: number; end: number; description: string }) =>
    api
      .post<{ expressions: ChunkExpressions; mark: EmotionMark }>(`/documents/${documentId}/parts/${index}/direction`, body, { auth: true })
      .then((r) => r.data),

  /**
   * "Say it yourself": the server measures a recording of the words (base64) and shapes the voice to it.
   * `shaped` is false when the recording was too faint to follow, and the voice goes by a description of it.
   */
  follow: (documentId: string, index: number, body: { start: number; end: number; recording: string }) =>
    api
      .post<{ expressions: ChunkExpressions; mark: EmotionMark; pauses: number; shaped?: boolean }>(`/documents/${documentId}/parts/${index}/delivery`, body, { auth: true, timeoutMs: FOLLOW_TIMEOUT_MS })
      .then((r) => r.data),

  /** "Make it expressive": sets the story style, then AI directs the lines ahead in the background */
  startAuto: (documentId: string, choice: NarrationChoice) =>
    api.post<{ document: DocumentSummary }>(`/documents/${documentId}/expressive`, choice, { auth: true }).then((r) => r.data.document),

  /** Changes or turns off the story style without a new AI run */
  setNarration: (documentId: string, choice: NarrationChoice) =>
    api.put<{ document: DocumentSummary }>(`/documents/${documentId}/narration`, choice, { auth: true }).then((r) => r.data.document),

  /** Gives a character a voice; null goes back to the one cast automatically */
  setCastVoice: (documentId: string, name: string, voiceId: string | null) => api.put<{ lines: number }>(`/documents/${documentId}/cast`, { name, voiceId }, { auth: true }),

  /** Stops using character voices: the narrator reads everything again */
  removeCast: (documentId: string) => api.delete<{ parts: number }>(`/documents/${documentId}/cast`, { auth: true }),

  clear: (documentId: string, only: 'ai' | 'all') => api.delete<{ chunks: number }>(`/documents/${documentId}/expressions?only=${only}`, { auth: true }),
};
