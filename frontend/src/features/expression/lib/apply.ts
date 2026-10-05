import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';

import { expressionsApi } from '../api/expressions.api';
import type { EmotionId } from '../catalog';
import { setEmotion, type Range } from './marks';

/**
 * Sets (or clears) the emotion on part of a chunk, saves it, and optionally
 * re-voices and plays that part right away so the change can be heard.
 */
export async function applyEmotion(
  chunkIndex: number,
  range: Range,
  emotion: EmotionId | null,
  options: { strong?: boolean; direction?: string; replay?: boolean } = {},
) {
  const { documentId, chunks } = usePlayerStore.getState();
  const chunk = chunks[chunkIndex];
  if (!documentId || !chunk) return null;
  const next = setEmotion(chunk.text, chunk.expressions, range, emotion, options);
  // Show it straight away; the server's copy replaces it once saved
  audioEngine.setExpressions(chunkIndex, next);
  try {
    const saved = await expressionsApi.setChunk(documentId, chunkIndex, next);
    audioEngine.setExpressions(chunkIndex, saved);
    if (options.replay) void audioEngine.replayFrom(chunkIndex, range.start);
    return saved;
  } catch (e) {
    audioEngine.setExpressions(chunkIndex, chunk.expressions);
    throw e;
  }
}

/** "Say it like a scared child": AI turns the words into a direction, then the part replays */
export async function describeRange(chunkIndex: number, range: Range, description: string) {
  const { documentId } = usePlayerStore.getState();
  if (!documentId) return null;
  const { expressions, mark } = await expressionsApi.describe(documentId, chunkIndex, { ...range, description });
  audioEngine.setExpressions(chunkIndex, expressions);
  void audioEngine.replayFrom(chunkIndex, range.start);
  return mark;
}
