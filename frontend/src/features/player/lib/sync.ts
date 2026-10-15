import type { ReaderChunk } from '@/features/library/types';

/** A moment in a part's audio and the character being spoken then: [character offset, ms] */
export type TextAnchor = [number, number];

/** The audio in the player: which part it is, its real length, and where its text is spoken */
export interface PlayingAudio {
  index: number;
  durationMs: number;
  /** In order of both character and time; null when the audio's timing isn't known */
  anchors: TextAnchor[] | null;
}

// Status updates are a moment old by the time they're drawn; look that far ahead
const LEAD_MS = 90;

/**
 * The character being spoken at `positionMs`. With anchors the highlight moves
 * evenly between them, so it runs while the voice speaks and waits through its
 * pauses; without them the text is spread evenly over the length.
 */
export function charAt(textLength: number, durationMs: number, anchors: TextAnchor[] | null, positionMs: number) {
  if (!anchors || anchors.length < 2) return Math.min(Math.max(positionMs / Math.max(durationMs, 1), 0), 1) * textLength;
  if (positionMs <= anchors[0][1]) return anchors[0][0];
  for (let i = 1; i < anchors.length; i++) {
    const [char, ms] = anchors[i];
    if (positionMs > ms) continue;
    const [fromChar, fromMs] = anchors[i - 1];
    return ms > fromMs ? fromChar + ((positionMs - fromMs) / (ms - fromMs)) * (char - fromChar) : char;
  }
  return anchors[anchors.length - 1][0];
}

/** When a character is spoken: the reverse of charAt, for starting a part at a line */
export function msAtChar(textLength: number, durationMs: number, anchors: TextAnchor[] | null, char: number) {
  if (!anchors || anchors.length < 2) return Math.round((Math.min(Math.max(char, 0), textLength) / Math.max(textLength, 1)) * durationMs);
  if (char <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [to, ms] = anchors[i];
    if (char > to) continue;
    const [from, fromMs] = anchors[i - 1];
    // At a pause (two anchors on one character) the line starts after it
    return Math.round(to > from ? fromMs + ((char - from) / (to - from)) * (ms - fromMs) : ms);
  }
  return anchors[anchors.length - 1][1];
}

export interface SpokenPosition {
  sentenceIndex: number;
  /** Character of the part being spoken */
  char: number;
}

/** A part's timing as last known (from the server, or from having played it), while its audio is still the same */
export const knownAnchors = (chunk: ReaderChunk): TextAnchor[] | null => (chunk.durationMs != null ? (chunk.anchors ?? null) : null);

/** Where the voice is in a part's text */
export function spokenPosition(chunk: ReaderChunk | undefined, playing: PlayingAudio | null, positionMs: number): SpokenPosition {
  if (!chunk || !chunk.sentences.length) return { sentenceIndex: 0, char: 0 };
  // Timing belongs to the audio in the player. A part still loading is placed by what's known of its
  // audio (so the line doesn't move when it arrives), and by its estimate when nothing is.
  const own = playing && playing.index === chunk.index ? playing : null;
  const anchors = own ? own.anchors : knownAnchors(chunk);
  const char = charAt(chunk.text.length, own?.durationMs ?? chunk.durationMs ?? chunk.estimatedMs, anchors, positionMs + (own || anchors ? LEAD_MS : 0));
  let sentenceIndex = chunk.sentences.findIndex((s) => char < s.end);
  if (sentenceIndex === -1) sentenceIndex = chunk.sentences.length - 1;
  return { sentenceIndex, char };
}
