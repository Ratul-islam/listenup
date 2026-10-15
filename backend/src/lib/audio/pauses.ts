import { MPEGDecoder } from 'mpg123-decoder'

/**
 * A silence in a clip: [startMs, endMs]. In a recording joined from several
 * takes, the silence a take starts after also says where in the text that
 * take starts: [startMs, endMs, character].
 */
export type Pause = [startMs: number, endMs: number, at?: number]

/** Mono samples (-1…1) of a decoded clip */
export interface DecodedAudio {
  samples: Float32Array
  sampleRate: number
}

const WINDOW_MS = 10
// Shorter gaps are between words, not between phrases
const MIN_PAUSE_MS = 120

const percentile = (sorted: Float32Array, p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]

/** An MP3 as mono samples (the first channel; speech is mono) */
export async function decodeMp3(mp3: Buffer): Promise<DecodedAudio> {
  const decoder = new MPEGDecoder()
  await decoder.ready
  try {
    const decoded = decoder.decode(new Uint8Array(mp3.buffer, mp3.byteOffset, mp3.byteLength))
    return { samples: decoded.channelData[0] ?? new Float32Array(), sampleRate: decoded.sampleRate || 24_000 }
  } finally {
    decoder.free()
  }
}

/**
 * The silences in decoded audio, found from its loudness every 10 ms. The
 * threshold adapts to each clip (voices and providers leave different noise
 * floors) and is never closer than 20 dB to the speech itself.
 */
export function pausesIn({ samples, sampleRate }: DecodedAudio): Pause[] {
  const window = Math.max(1, Math.round((sampleRate * WINDOW_MS) / 1000))
  const count = Math.floor(samples.length / window)
  if (count < 2) return []
  const levels = new Float32Array(count)
  for (let w = 0; w < count; w++) {
    let sum = 0
    for (let i = w * window, end = i + window; i < end; i++) sum += samples[i] * samples[i]
    levels[w] = 10 * Math.log10(sum / window + 1e-12)
  }
  const sorted = Float32Array.from(levels).sort()
  const floor = percentile(sorted, 0.1)
  const speech = percentile(sorted, 0.9)
  const threshold = Math.min(floor + 0.3 * (speech - floor), speech - 20)

  const pauses: Pause[] = []
  let start = -1
  for (let w = 0; w <= count; w++) {
    const quiet = w < count && levels[w] < threshold
    if (quiet && start < 0) start = w
    if (!quiet && start >= 0) {
      if ((w - start) * WINDOW_MS >= MIN_PAUSE_MS) pauses.push([start * WINDOW_MS, w * WINDOW_MS])
      start = -1
    }
  }
  return pauses
}

// How far a take's start may sit from the silence found around it (an MP3 plays a little later than the audio it was made from)
const JOIN_REACH_MS = 90

/**
 * A joined recording's silences, with the ones its takes start after marked
 * with where each take starts in the text. A take that starts with no silence
 * before it gets an empty one of its own.
 */
export function markJoins(pauses: Pause[], joins: { at: number; ms: number }[]): Pause[] {
  const out = pauses.map((p): Pause => [p[0], p[1]])
  for (const join of joins) {
    const around = out.filter((p) => p[2] === undefined && join.ms >= p[0] - JOIN_REACH_MS && join.ms <= p[1] + JOIN_REACH_MS)
    // The longest silence in reach is the one between the takes
    const pause = around.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0]
    if (pause) pause[2] = join.at
    else out.push([join.ms, join.ms, join.at])
  }
  return out.sort((a, b) => a[0] - b[0])
}

/** The silences in an MP3 */
export async function findPauses(mp3: Buffer): Promise<Pause[]> {
  return pausesIn(await decodeMp3(mp3))
}

// A pause this close to either end of a clip is its leading or trailing silence
const EDGE_MS = 40

/** How long a clip is silent before its speech starts and after it ends */
export function edgeSilence(pauses: Pause[], durationMs: number) {
  const first = pauses[0]
  const last = pauses.at(-1)
  const leadMs = first && first[0] <= EDGE_MS ? first[1] : 0
  const tailMs = last && last[1] >= durationMs - EDGE_MS && (last !== first || !leadMs) ? Math.max(durationMs - last[0], 0) : 0
  return { leadMs, tailMs }
}

/** Where a clip's speech starts and ends, keeping this much of the silence either side */
export function speechBounds(audio: DecodedAudio, keepLeadMs: number, keepTailMs: number) {
  const durationMs = (audio.samples.length / audio.sampleRate) * 1000
  const { leadMs, tailMs } = edgeSilence(pausesIn(audio), durationMs)
  const startMs = Math.max(leadMs - keepLeadMs, 0)
  const endMs = Math.min(durationMs - tailMs + keepTailMs, durationMs)
  // Silent all through: leave it as it is
  return endMs > startMs ? { startMs, endMs, durationMs } : { startMs: 0, endMs: durationMs, durationMs }
}
