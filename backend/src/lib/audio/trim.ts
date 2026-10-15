import { cutFrames } from './mp3.js'
import { decodeMp3, speechBounds } from './pauses.js'

// Speech services pad every clip with silence (Kokoro about 0.34 s before and 0.24 s
// after), which made a long stop between paragraphs. Clips keep only this much; the
// player's change of file and the export's gap between parts make up the rest.
export const KEEP_LEAD_MS = 60
export const KEEP_TAIL_MS = 140

/** 16-bit little-endian PCM without its long leading and trailing silence */
export function trimPcm(pcm: Buffer, sampleRate: number) {
  const count = Math.floor(pcm.length / 2)
  const samples = new Float32Array(count)
  for (let i = 0; i < count; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768
  const { startMs, endMs } = speechBounds({ samples, sampleRate }, KEEP_LEAD_MS, KEEP_TAIL_MS)
  const byte = (ms: number) => Math.min(Math.round((ms / 1000) * sampleRate), count) * 2
  return pcm.subarray(byte(startMs), byte(endMs))
}

/**
 * An MP3 without its long leading and trailing silence, cut on frame
 * boundaries (no re-encoding). Null when there's too little to trim to bother.
 */
export async function trimMp3(mp3: Buffer, minSavedMs = 60) {
  const { startMs, endMs, durationMs } = speechBounds(await decodeMp3(mp3), KEEP_LEAD_MS, KEEP_TAIL_MS)
  if (startMs + (durationMs - endMs) < minSavedMs) return null
  const cut = cutFrames(mp3, startMs, endMs)
  return cut.audio.length ? cut : null
}
