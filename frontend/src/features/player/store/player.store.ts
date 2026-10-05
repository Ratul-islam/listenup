import { create } from 'zustand';

import type { DocumentSummary, Lang, ReaderChunk } from '@/features/library/types';
import type { VoiceTier } from '@/features/voices/api/voices.api';
import { perLanguage } from '@/lib/languages';

export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'error';

/** A one-off message for the listener (shown as a toast), e.g. after switching to the phone voice */
export interface PlayerNotice {
  message: string;
  /** Offer the plans page alongside it */
  showPlans?: boolean;
  /** Offer a rewarded ad for more Natural minutes instead, when one is ready (Free) */
  offerAd?: boolean;
}

export interface PlayerState {
  status: PlayerStatus;
  error: string | null;
  /** Machine-readable code of `error`, e.g. VOICE_MISSING */
  errorCode: string | null;
  notice: PlayerNotice | null;
  documentId: string | null;
  document: DocumentSummary | null;
  chunks: ReaderChunk[];
  /** Voice actually used per language (server-resolved) */
  voices: Record<Lang, string>;
  /** Whether those voices can take emotions */
  expressive: Record<Lang, boolean>;
  /** Those voices' levels; "phone" voices are voiced on this device */
  tiers: Record<Lang, VoiceTier>;
  /** Voice the listener picked for this document */
  voiceId: string | null;
  chunkIndex: number;
  /** Media position inside the current chunk */
  positionMs: number;
  isPlaying: boolean;
  isBuffering: boolean;
  speed: number;
  /** Epoch ms when the sleep timer pauses playback */
  sleepAt: number | null;
  finished: boolean;
}

export const initialPlayerState: PlayerState = {
  status: 'idle',
  error: null,
  errorCode: null,
  notice: null,
  documentId: null,
  document: null,
  chunks: [],
  // Replaced by the server's choices as soon as a document opens
  voices: perLanguage(() => ''),
  expressive: perLanguage(() => false),
  tiers: perLanguage(() => 'natural'),
  voiceId: null,
  chunkIndex: 0,
  positionMs: 0,
  isPlaying: false,
  isBuffering: false,
  speed: 1,
  sleepAt: null,
  finished: false,
};

export const usePlayerStore = create<PlayerState>()(() => initialPlayerState);

/** Length of a chunk: real once voiced, estimated before */
export const chunkDuration = (c: ReaderChunk) => c.durationMs ?? c.estimatedMs;

export function timeline(chunks: ReaderChunk[]) {
  const starts: number[] = [];
  let total = 0;
  for (const c of chunks) {
    starts.push(total);
    total += chunkDuration(c);
  }
  return { starts, total };
}

/** Global position across the whole document */
export function globalPosition(state: Pick<PlayerState, 'chunks' | 'chunkIndex' | 'positionMs'>) {
  const { starts, total } = timeline(state.chunks);
  return { positionMs: (starts[state.chunkIndex] ?? 0) + state.positionMs, totalMs: total };
}

export function locate(chunks: ReaderChunk[], globalMs: number) {
  const { starts, total } = timeline(chunks);
  const clamped = Math.max(0, Math.min(globalMs, Math.max(total - 1, 0)));
  let index = 0;
  while (index < chunks.length - 1 && starts[index + 1] <= clamped) index++;
  return { index, offsetMs: clamped - (starts[index] ?? 0) };
}
