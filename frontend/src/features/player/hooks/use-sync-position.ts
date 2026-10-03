import { useMemo } from 'react';

import type { ReaderChunk } from '@/features/library/types';

import { chunkDuration } from '../store/player.store';

export interface SyncPosition {
  sentenceIndex: number;
  /** Characters of the current sentence already spoken */
  spokenChars: number;
}

/**
 * Where the voice is inside a chunk. Providers don't return word timings, so
 * time is mapped to text proportionally by character count; sentence
 * boundaries come from the server and stay exact.
 */
export function useSyncPosition(chunk: ReaderChunk | undefined, positionMs: number): SyncPosition {
  return useMemo(() => {
    if (!chunk || !chunk.sentences.length) return { sentenceIndex: 0, spokenChars: 0 };
    const progress = Math.min(Math.max(positionMs / Math.max(chunkDuration(chunk), 1), 0), 1);
    const char = progress * chunk.text.length;
    let sentenceIndex = chunk.sentences.findIndex((s) => char < s.end);
    if (sentenceIndex === -1) sentenceIndex = chunk.sentences.length - 1;
    const s = chunk.sentences[sentenceIndex];
    return { sentenceIndex, spokenChars: Math.max(0, Math.min(char - s.start, s.end - s.start)) };
  }, [chunk, positionMs]);
}
