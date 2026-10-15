import { File, Paths } from 'expo-file-system';

/**
 * What the home-screen widget shows. The app writes it; the widget reads it,
 * also while the app is closed, so it holds only what's needed to draw.
 */
export interface WidgetSnapshot {
  signedIn: boolean;
  /** The most recent unfinished item on the shelf */
  item: { id: string; title: string; author: string | null; fraction: number; secondsLeft: number } | null;
}

export const SIGNED_OUT: WidgetSnapshot = { signedIn: false, item: null };

const snapshotFile = () => new File(Paths.document, 'home-widget.json');

export function readWidgetSnapshot(): WidgetSnapshot {
  try {
    const file = snapshotFile();
    return file.exists ? (JSON.parse(file.textSync()) as WidgetSnapshot) : SIGNED_OUT;
  } catch {
    return SIGNED_OUT;
  }
}

export function writeWidgetSnapshot(snapshot: WidgetSnapshot) {
  try {
    snapshotFile().write(JSON.stringify(snapshot));
  } catch {
    // The widget keeps what it last showed
  }
}
