import type { DocumentSummary } from '@/features/library/types';
import { api } from '@/lib/api/client';

import type { ChunkExpressions } from '../catalog';

export const expressionsApi = {
  /** Replaces one chunk's emotions and sounds; its audio regenerates on next play */
  setChunk: (documentId: string, index: number, expressions: ChunkExpressions) =>
    api
      .put<{ expressions: ChunkExpressions }>(`/expressions/${documentId}/chunks/${index}`, expressions, { auth: true })
      .then((r) => r.data.expressions),

  /** "Make it expressive": AI suggests emotions in the background */
  startAuto: (documentId: string) =>
    api.post<{ document: DocumentSummary }>(`/expressions/${documentId}/auto`, undefined, { auth: true }).then((r) => r.data.document),

  clear: (documentId: string, only: 'ai' | 'all') => api.delete<{ chunks: number }>(`/expressions/${documentId}?only=${only}`, { auth: true }),
};
