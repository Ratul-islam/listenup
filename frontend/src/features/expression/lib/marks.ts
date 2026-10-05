import type { ChunkExpressions, EmotionId, EmotionMark, SoundId } from '../catalog';

export interface Range {
  start: number;
  end: number;
}

/**
 * Sets the emotion on a range of a chunk (null clears it). Marks overlapping
 * the range are trimmed around it; leftovers that are only spaces or
 * punctuation are dropped.
 */
export function setEmotion(
  text: string,
  e: ChunkExpressions,
  range: Range,
  emotion: EmotionId | null,
  options: { strong?: boolean; direction?: string } = {},
): ChunkExpressions {
  const emotions: EmotionMark[] = [];
  const keep = (m: EmotionMark) => /[\p{L}\p{N}]/u.test(text.slice(m.start, m.end)) && emotions.push(m);
  for (const m of e.emotions) {
    if (m.end <= range.start || m.start >= range.end) {
      emotions.push(m);
      continue;
    }
    if (m.start < range.start) keep({ ...m, end: range.start });
    if (m.end > range.end) keep({ ...m, start: range.end });
  }
  if (emotion) {
    emotions.push({ start: range.start, end: range.end, emotion, ...(options.strong && { strong: true }), ...(options.direction && { direction: options.direction }) });
  }
  return { ...e, emotions: emotions.sort((a, b) => a.start - b.start) };
}

/** Puts a sound right before a position (null removes it) */
export function setSound(e: ChunkExpressions, at: number, sound: SoundId | null): ChunkExpressions {
  const sounds = e.sounds.filter((s) => s.at !== at);
  if (sound) sounds.push({ at, sound });
  return { ...e, sounds: sounds.sort((a, b) => a.at - b.at) };
}

/** The mark covering all of a range, if one does */
export const markOf = (e: ChunkExpressions, range: Range) => e.emotions.find((m) => m.start <= range.start && m.end >= range.end) ?? null;

/** The emotion covering all of a range, if one does */
export const emotionOf = (e: ChunkExpressions, range: Range) =>
  e.emotions.find((m) => m.start <= range.start && m.end >= range.end)?.emotion ?? null;

export const soundAt = (e: ChunkExpressions, at: number) => e.sounds.find((s) => s.at === at)?.sound ?? null;

/** Emotions touching a range, in order and without repeats (for "😢 Sad" badges) */
export function emotionsIn(e: ChunkExpressions, range: Range) {
  return [...new Set(e.emotions.filter((m) => m.start < range.end && m.end > range.start).map((m) => m.emotion))];
}

export const hasMarks = (e: ChunkExpressions) => e.emotions.length > 0 || e.sounds.length > 0;

export interface Run extends Range {
  emotion: EmotionId | null;
  /** First run of its mark, where the emoji goes */
  markStart: boolean;
  /** Sound right before this run */
  sound: SoundId | null;
}

/** Splits part of a chunk into runs of the same emotion, for drawing tints and emoji */
export function runsOf(e: ChunkExpressions, range: Range): Run[] {
  const cuts = new Set([range.start, range.end]);
  for (const m of e.emotions) [m.start, m.end].forEach((c) => c > range.start && c < range.end && cuts.add(c));
  for (const s of e.sounds) if (s.at > range.start && s.at < range.end) cuts.add(s.at);
  const points = [...cuts].sort((a, b) => a - b);

  return points.slice(0, -1).map((start, i) => {
    const end = points[i + 1];
    const mark = e.emotions.find((m) => m.start <= start && m.end >= end);
    return { start, end, emotion: mark?.emotion ?? null, markStart: !!mark && mark.start === start, sound: soundAt(e, start) };
  });
}

/** Word spans of a sentence, for picking words */
export function wordsOf(text: string, range: Range): Range[] {
  const words: Range[] = [];
  for (const match of text.slice(range.start, range.end).matchAll(/\S+/g)) {
    words.push({ start: range.start + match.index, end: range.start + match.index + match[0].length });
  }
  return words;
}
