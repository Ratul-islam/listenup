import * as StoreReview from 'expo-store-review';

import { secureStorage } from '@/lib/storage/secure-storage';

const FINISHED_KEY = 'review.finishedCount';
const ASKED_KEY = 'review.lastAskedAt';
// Ask after the second finished document, and at most this often
const AFTER_FINISHED = 2;
const MIN_GAP_MS = 120 * 24 * 60 * 60_000;

/**
 * Counts finished documents and, at a good moment (the second one done), shows
 * Google Play's in-app rating prompt. Play itself may still decide not to show it.
 */
export async function noteFinishedDocument() {
  try {
    const finished = Number((await secureStorage.get(FINISHED_KEY)) ?? 0) + 1;
    await secureStorage.set(FINISHED_KEY, String(finished));
    if (finished < AFTER_FINISHED) return;

    const lastAsked = Number((await secureStorage.get(ASKED_KEY)) ?? 0);
    if (Date.now() - lastAsked < MIN_GAP_MS || !(await StoreReview.isAvailableAsync())) return;
    await secureStorage.set(ASKED_KEY, String(Date.now()));
    await StoreReview.requestReview();
  } catch {
    // A rating prompt is never worth an error
  }
}
