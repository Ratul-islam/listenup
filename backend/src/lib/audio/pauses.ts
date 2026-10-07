import { MPEGDecoder } from 'mpg123-decoder'

/** A silence in a clip: [startMs, endMs] */
export type Pause = [number, number]

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

/** The silences in an MP3 */
export async function findPauses(mp3: Buffer): Promise<Pause[]> {
  return pausesIn(await decodeMp3(mp3))
}
