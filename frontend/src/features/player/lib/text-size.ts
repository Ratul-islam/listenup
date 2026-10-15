import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/** How large the player's text is, smallest first */
export const TEXT_SIZES = ['small', 'medium', 'large', 'largest'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_LABELS: Record<TextSize, string> = { small: 'Small', medium: 'Medium', large: 'Large', largest: 'Largest' };

const SIZE: Record<TextSize, number> = { small: 16, medium: 18, large: 21, largest: 24 };
// Roomy enough for Bangla's marks above and below the line
const LEADING = 1.62;

/** Font size and line height for a text size. Every line is set the same, so the page doesn't shift as the voice moves. */
export function textMetrics(size: TextSize) {
  const fontSize = SIZE[size];
  return { fontSize, lineHeight: Math.round(fontSize * LEADING) };
}

const KEY = 'settings.playerTextSize';

function read(): TextSize {
  try {
    const value = SecureStore.getItem(KEY) as TextSize | null;
    return value && TEXT_SIZES.includes(value) ? value : 'medium';
  } catch {
    return 'medium';
  }
}

interface TextSizeState {
  size: TextSize;
  /** The next size up, and round to the smallest after the largest */
  cycle: () => TextSize;
}

/** The listener's text size in the player, kept on this phone */
export const useTextSize = create<TextSizeState>((set, get) => ({
  size: read(),
  cycle: () => {
    const size = TEXT_SIZES[(TEXT_SIZES.indexOf(get().size) + 1) % TEXT_SIZES.length];
    set({ size });
    try {
      SecureStore.setItem(KEY, size);
    } catch {
      // Not saved; it still applies until the app restarts
    }
    return size;
  },
}));
