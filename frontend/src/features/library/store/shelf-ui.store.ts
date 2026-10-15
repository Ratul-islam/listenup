import { create } from 'zustand';

interface ShelfUiState {
  /** The shelf's top card is on the page (it isn't while searching or filtering, or on an empty shelf) */
  cardShown: boolean;
  /** The page has been scrolled far enough that the card is out of sight */
  cardScrolledAway: boolean;
  setCardShown: (shown: boolean) => void;
  setCardScrolledAway: (away: boolean) => void;
}

/**
 * Whether the shelf's top card can be seen. While it can, it is the player on
 * that page, so the mini player above the tabs steps aside instead of showing
 * the same thing twice.
 */
export const useShelfUi = create<ShelfUiState>((set) => ({
  cardShown: false,
  cardScrolledAway: false,
  setCardShown: (cardShown) => set((s) => (s.cardShown === cardShown ? s : { cardShown })),
  setCardScrolledAway: (cardScrolledAway) => set((s) => (s.cardScrolledAway === cardScrolledAway ? s : { cardScrolledAway })),
}));

/** The top card is in view, standing in for the mini player */
export const useCardInView = () => useShelfUi((s) => s.cardShown && !s.cardScrolledAway);
