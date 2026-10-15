import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';

import { expressionsApi } from '../api/expressions.api';
import type { ChunkExpressions, EmotionId } from '../catalog';
import { setEmotion, type Range } from './marks';

interface Saving {
  /** What the server last confirmed (or had before the first change) */
  confirmed: ChunkExpressions;
  /** Newer marks waiting for the save in flight to finish */
  next: ChunkExpressions | null;
  done: Promise<ChunkExpressions>;
}

// One save at a time per part, always of its latest marks
const saving = new Map<string, Saving>();

/**
 * Saves a part's marks. Quick changes to the same part (painting line after
 * line) are sent one after another, each carrying everything so far, so a
 * slow or out-of-order answer can't undo a later tap. Resolves, for every
 * caller, with what the server holds once nothing is left to send.
 */
function save(documentId: string, index: number, before: ChunkExpressions, marks: ChunkExpressions): Promise<ChunkExpressions> {
  const key = `${documentId}:${index}`;
  const running = saving.get(key);
  if (running) {
    running.next = marks;
    return running.done;
  }
  const entry: Saving = { confirmed: before, next: null, done: Promise.resolve(before) };
  entry.done = (async () => {
    try {
      for (let sending: ChunkExpressions | null = marks; sending; sending = entry.next) {
        entry.next = null;
        entry.confirmed = await expressionsApi.setChunk(documentId, index, sending);
      }
      return entry.confirmed;
    } catch (e) {
      // Everyone waiting learns what the server still holds, to go back to
      throw Object.assign(e instanceof Error ? e : new Error(String(e)), { confirmed: entry.confirmed });
    } finally {
      saving.delete(key);
    }
  })();
  saving.set(key, entry);
  return entry.done;
}

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
  // Show it straight away; the server's copy replaces it once everything is saved
  audioEngine.setExpressions(chunkIndex, next);
  try {
    const saved = await save(documentId, chunkIndex, chunk.expressions, next);
    if (usePlayerStore.getState().documentId !== documentId) return saved;
    audioEngine.setExpressions(chunkIndex, saved);
    if (options.replay && audioEngine.takesEmotions(chunkIndex)) void audioEngine.replayFrom(chunkIndex, range.start);
    return saved;
  } catch (e) {
    // Back to what the server has, unless a newer save is already under way
    const confirmed = (e as { confirmed?: ChunkExpressions }).confirmed ?? chunk.expressions;
    if (!saving.has(`${documentId}:${chunkIndex}`) && usePlayerStore.getState().documentId === documentId) audioEngine.setExpressions(chunkIndex, confirmed);
    throw e;
  }
}

/** Saves a part's marks as they are (sounds, say), in line with any emotion saves under way */
export async function saveExpressions(chunkIndex: number, marks: ChunkExpressions) {
  const { documentId, chunks } = usePlayerStore.getState();
  const chunk = chunks[chunkIndex];
  if (!documentId || !chunk) return null;
  audioEngine.setExpressions(chunkIndex, marks);
  const saved = await save(documentId, chunkIndex, chunk.expressions, marks);
  audioEngine.setExpressions(chunkIndex, saved);
  return saved;
}

/** "Say it like a scared child": AI turns the words into a direction, then the part replays */
export async function describeRange(chunkIndex: number, range: Range, description: string) {
  const { documentId } = usePlayerStore.getState();
  if (!documentId) return null;
  const { expressions, mark } = await expressionsApi.describe(documentId, chunkIndex, { ...range, description });
  audioEngine.setExpressions(chunkIndex, expressions);
  if (audioEngine.takesEmotions(chunkIndex)) void audioEngine.replayFrom(chunkIndex, range.start);
  return mark;
}

/** "Say it yourself": the story's voice is shaped to the listener's recording of the words, then the part replays */
export async function followRecording(chunkIndex: number, range: Range, recording: string) {
  const { documentId } = usePlayerStore.getState();
  if (!documentId) return null;
  const { expressions, mark, pauses, shaped } = await expressionsApi.follow(documentId, chunkIndex, { ...range, recording });
  audioEngine.setExpressions(chunkIndex, expressions);
  if (audioEngine.takesEmotions(chunkIndex)) void audioEngine.replayFrom(chunkIndex, range.start);
  return { mark, pauses, shaped };
}
