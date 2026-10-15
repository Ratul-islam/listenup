import { create } from 'zustand';

import type { EmotionId } from '@/features/expression/catalog';
import type { Range } from '@/features/expression/lib/marks';

/** One line (sentence) of a part */
export interface LineRef {
  chunkIndex: number;
  sentenceIndex: number;
}

/** Words chosen inside one part, starting from a held line */
export interface WordSelection extends LineRef, Range {}

export type Brush = EmotionId | 'erase';

interface PlayerUiState {
  /** The line that was tapped: its tools show right under it */
  line: LineRef | null;
  /** Words being chosen with the handles; the tools for them sit where the page's tools were */
  words: WordSelection | null;
  /** Paint mode: one feeling given to many lines, a tap each */
  painting: boolean;
  brush: Brush;
  /** The page follows the voice, until the listener scrolls somewhere else */
  following: boolean;
  /** The page's large title is on screen, so the bar above doesn't repeat it */
  titleOnPage: boolean;
  selectLine: (line: LineRef | null) => void;
  selectWords: (words: WordSelection | null) => void;
  setPainting: (painting: boolean) => void;
  setBrush: (brush: Brush) => void;
  setFollowing: (following: boolean) => void;
  setTitleOnPage: (titleOnPage: boolean) => void;
  /** Puts everything away and goes back to following the voice */
  reset: () => void;
}

/**
 * What the listener is doing with the player's text: a line picked, words
 * being chosen, or painting. The text and the tools under it both follow it.
 * Only one of the three is on at a time.
 */
export const usePlayerUi = create<PlayerUiState>((set) => ({
  line: null,
  words: null,
  painting: false,
  brush: 'scared',
  following: true,
  titleOnPage: false,
  selectLine: (line) => set({ line, words: null, painting: false }),
  selectWords: (words) => set({ words, line: null, painting: false }),
  setPainting: (painting) => set({ painting, line: null, words: null }),
  setBrush: (brush) => set({ brush }),
  setFollowing: (following) => set({ following }),
  setTitleOnPage: (titleOnPage) => set((s) => (s.titleOnPage === titleOnPage ? s : { titleOnPage })),
  reset: () => set({ line: null, words: null, painting: false, following: true }),
}));
