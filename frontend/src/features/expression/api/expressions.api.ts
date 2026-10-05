import type { DocumentSummary } from '@/features/library/types';
import { api } from '@/lib/api/client';

import type { ChunkExpressions, EmotionMark, NarrationStrength, NarrationStyleId } from '../catalog';

export interface NarrationChoice {
  /** "auto" lets the AI pick; null turns the style off */
  style: NarrationStyleId | 'auto' | null;
  strength: NarrationStrength;
}

export const expressionsApi = {
  /** Replaces one chunk's emotions and sounds; its audio regenerates on next play */
  setChunk: (documentId: string, index: number, expressions: ChunkExpressions) =>
    api
      .put<{ expressions: ChunkExpressions }>(`/expressions/${documentId}/chunks/${index}`, expressions, { auth: true })
      .then((r) => r.data.expressions),

  /** "Say it like a scared child": AI turns the words into a direction for part of a chunk */
  describe: (documentId: string, index: number, body: { start: number; end: number; description: string }) =>
    api
      .post<{ expressions: ChunkExpressions; mark: EmotionMark }>(`/expressions/${documentId}/chunks/${index}/describe`, body, { auth: true })
      .then((r) => r.data),

  /** "Make it expressive": sets the story style, then AI directs the lines ahead in the background */
  startAuto: (documentId: string, choice: NarrationChoice) =>
    api.post<{ document: DocumentSummary }>(`/expressions/${documentId}/auto`, choice, { auth: true }).then((r) => r.data.document),

  /** Changes or turns off the story style without a new AI run */
  setNarration: (documentId: string, choice: NarrationChoice) =>
    api.put<{ document: DocumentSummary }>(`/expressions/${documentId}/narration`, choice, { auth: true }).then((r) => r.data.document),

  clear: (documentId: string, only: 'ai' | 'all') => api.delete<{ chunks: number }>(`/expressions/${documentId}?only=${only}`, { auth: true }),
};
