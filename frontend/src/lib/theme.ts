import * as SecureStore from 'expo-secure-store';
import { useState } from 'react';
import { Uniwind } from 'uniwind';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'settings.theme';

/** Read synchronously at launch so the first frame already has the right theme */
function readTheme(): ThemePreference {
  try {
    const value = SecureStore.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyStoredTheme() {
  Uniwind.setTheme(readTheme());
}

/** Appearance setting: follow the phone, or always light / dark. Stored on this device. */
export function useThemePreference() {
  const [theme, setTheme] = useState(readTheme);
  const change = (next: ThemePreference) => {
    setTheme(next);
    Uniwind.setTheme(next);
    try {
      SecureStore.setItem(KEY, next);
    } catch {
      // Not saved; it still applies until the app restarts
    }
  };
  return [theme, change] as const;
}
