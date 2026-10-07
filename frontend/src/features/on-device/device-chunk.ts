import type { ReaderChunk } from '@/features/library/types';
import { speakable } from '@/features/pronunciations/lib/pronounce';

import { onDeviceVoice } from './on-device-voice';

/** Sentences shorter than this join the next one, so very short clips don't add pauses */
const MIN_PART_CHARS = 40;

export interface DevicePart {
  /** Character range in the chunk's text */
  start: number;
  end: number;
}

/** A voiced part; `uri` is null when the model found nothing to say (e.g. only symbols) */
export interface DeviceClip {
  uri: string | null;
  durationMs: number;
}

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code ?? null;

/** Splits a chunk at the server's sentence boundaries, joining very short sentences */
function splitParts(chunk: ReaderChunk): DevicePart[] {
  const spans = chunk.sentences.length ? chunk.sentences : [{ start: 0, end: chunk.text.length }];
  const parts: DevicePart[] = [];
  for (const span of spans) {
    const last = parts[parts.length - 1];
    if (last && last.end - last.start < MIN_PART_CHARS) last.end = span.end;
    else parts.push({ start: span.start, end: span.end });
  }
  // A short tail joins the part before it
  const tail = parts[parts.length - 1];
  if (parts.length > 1 && tail.end - tail.start < MIN_PART_CHARS) parts[parts.length - 2].end = parts.pop()!.end;
  return parts.filter((p) => chunk.text.slice(p.start, p.end).trim());
}

/**
 * A chunk voiced on the phone a few sentences at a time, so playback starts
 * once the first part is ready and the rest are voiced while it plays.
 */
export class DeviceChunk {
  readonly parts: DevicePart[];
  private clips: (Promise<DeviceClip> | undefined)[] = [];
  private durations: (number | undefined)[] = [];

  constructor(
    readonly chunk: ReaderChunk,
    readonly speaker: string,
    /** The chunk's estimated length changed as parts were voiced */
    private readonly onEstimate: (durationMs: number) => void,
  ) {
    this.parts = splitParts(chunk);
  }

  /**
   * The audio for part `i`, voiced in order after anything already waiting.
   * A part dropped by a seek is asked for again when it's needed.
   */
  clip(i: number, wanted: () => boolean = () => true): Promise<DeviceClip> {
    const pending = this.clips[i] ?? this.request(i);
    // Dropped by a seek while it waited: ask again if it's still needed
    return pending.catch((error) =>
      codeOf(error) === 'CANCELLED' && wanted() ? (this.clips[i] ?? this.request(i)) : Promise.reject(error),
    );
  }

  private request(i: number): Promise<DeviceClip> {
    const part = this.parts[i];
    const pending = onDeviceVoice
      .synthesize(speakable(this.chunk.text.slice(part.start, part.end).trim()), this.speaker)
      .then(
        (clip): DeviceClip => ({ uri: clip.uri, durationMs: clip.durationMs }),
        (error): DeviceClip => {
          // Nothing the model could say: skip it rather than stop
          if (codeOf(error) === 'NOTHING_TO_SAY') return { uri: null, durationMs: 0 };
          throw error;
        },
      )
      .then((clip) => {
        this.durations[i] = clip.durationMs;
        this.onEstimate(this.estimatedMs());
        return clip;
      });
    this.clips[i] = pending;
    pending.catch(() => {
      if (this.clips[i] === pending) this.clips[i] = undefined;
    });
    return pending;
  }

  /** Queues every part not voiced yet */
  requestAll() {
    this.parts.forEach((_, i) => {
      if (!this.clips[i]) void this.request(i).catch(() => {});
    });
  }

  /** Real length once every part is voiced; until then, scaled from the parts so far */
  estimatedMs() {
    let knownMs = 0;
    let knownChars = 0;
    let restChars = 0;
    this.parts.forEach((p, i) => {
      const d = this.durations[i];
      if (d === undefined) restChars += p.end - p.start;
      else {
        knownMs += d;
        knownChars += p.end - p.start;
      }
    });
    if (!knownChars) return this.chunk.durationMs ?? this.chunk.estimatedMs;
    return Math.round(knownMs + (restChars * knownMs) / knownChars);
  }

  /** Every part is voiced */
  get complete() {
    return this.durations.filter((d) => d !== undefined).length === this.parts.length;
  }

  /** The part playing at `offsetMs` into the chunk, and where it starts; voices earlier parts if needed */
  async locate(offsetMs: number, wanted?: () => boolean) {
    let startMs = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const { durationMs } = await this.clip(i, wanted);
      if (offsetMs < startMs + durationMs || i === this.parts.length - 1) return { part: i, startMs };
      startMs += durationMs;
    }
    return { part: 0, startMs: 0 };
  }
}
