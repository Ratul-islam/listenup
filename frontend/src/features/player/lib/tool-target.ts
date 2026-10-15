import { useShallow } from 'zustand/react/shallow';

import { lineJustHeard, markOf, type Range } from '@/features/expression/lib/marks';

import { usePlayerUi, type LineRef } from '../store/player-ui.store';
import { usePlayerStore, type PlayerState } from '../store/player.store';
import { spokenPosition } from './sync';

/** The words a tool under the page acts on */
export type ToolTarget = LineRef & Range & { /** Only some of a line's words, chosen with the handles */ partial: boolean };

/** The line a listener means when they react while listening: the one that just ended, early in the next */
function heardLine(s: PlayerState): (LineRef & Range) | null {
  const chunk = s.chunks[s.chunkIndex];
  if (!chunk?.sentences.length) return null;
  const { sentenceIndex, char } = spokenPosition(chunk, s.playing, s.positionMs);
  const heard = lineJustHeard(chunk.sentences, sentenceIndex, Math.max(char - chunk.sentences[sentenceIndex].start, 0));
  return { chunkIndex: s.chunkIndex, sentenceIndex: heard.index, ...heard.line };
}

/**
 * What "Feeling" and "Say it" under the page act on: the words chosen, else
 * the line that was tapped, else the line being heard.
 */
export function toolTarget(): ToolTarget | null {
  const { line, words } = usePlayerUi.getState();
  const s = usePlayerStore.getState();
  if (words) return { ...words, partial: true };
  if (!line) {
    const heard = heardLine(s);
    return heard && { ...heard, partial: false };
  }
  const sentence = s.chunks[line.chunkIndex]?.sentences[line.sentenceIndex];
  return sentence ? { ...line, start: sentence.start, end: sentence.end, partial: false } : null;
}

/** The feeling on the line the tools act on, to show on the Feeling button. Changes only when that feeling does. */
export function useToolFeeling() {
  const line = usePlayerUi((s) => s.line);
  return usePlayerStore(
    useShallow((s) => {
      const sentence = line ? s.chunks[line.chunkIndex]?.sentences[line.sentenceIndex] : null;
      const target = line && sentence ? { chunkIndex: line.chunkIndex, start: sentence.start, end: sentence.end } : heardLine(s);
      const chunk = target ? s.chunks[target.chunkIndex] : null;
      const mark = chunk && target ? markOf(chunk.expressions, target) : null;
      return { emotion: mark?.emotion ?? null, strong: !!mark?.strong };
    }),
  );
}
