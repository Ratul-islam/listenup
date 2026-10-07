import type { DecodedAudio } from './pauses.js'

export const PEAK_BARS = 48
// Loudness range drawn: quieter than the floor is flat, louder than the top is full height
const FLOOR_DB = -50
const TOP_DB = -8

/**
 * A clip's loudness in even slices, 0–100, for drawing its waveform. Levels are
 * absolute (dBFS), not scaled per clip, so a quiet part looks quiet next to a
 * loud one.
 */
export function peaksOf({ samples }: DecodedAudio, bars = PEAK_BARS): number[] {
  if (!samples.length) return Array(bars).fill(0)
  const size = samples.length / bars
  const out: number[] = []
  for (let b = 0; b < bars; b++) {
    const from = Math.floor(b * size)
    const to = Math.max(from + 1, Math.floor((b + 1) * size))
    let sum = 0
    for (let i = from; i < to; i++) sum += samples[i] * samples[i]
    const db = 10 * Math.log10(sum / (to - from) + 1e-12)
    out.push(Math.round(Math.min(1, Math.max(0, (db - FLOOR_DB) / (TOP_DB - FLOOR_DB))) * 100))
  }
  return out
}
