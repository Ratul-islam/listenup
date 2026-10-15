const FRAME_MS = 40
const HOP_MS = 40
// Quieter than this is silence, not speech
const SILENCE_RMS = 0.01
// Human pitch; a frame that repeats itself this clearly within the range is voiced
const MIN_HZ = 70
const MAX_HZ = 400
const VOICED_CORRELATION = 0.6

/**
 * How much of a clip's speech is voiced (0–1), from 16-bit mono PCM. Ordinary
 * speech is about half voiced; a real whisper has almost none, which is how a
 * whispered line is told from one the voice read aloud anyway.
 */
export function voicedShare(pcm: Buffer, sampleRate: number) {
  const count = Math.floor(pcm.length / 2)
  const samples = new Float32Array(count)
  for (let i = 0; i < count; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768
  const frame = Math.round((sampleRate * FRAME_MS) / 1000)
  const hop = Math.round((sampleRate * HOP_MS) / 1000)
  const shortest = Math.floor(sampleRate / MAX_HZ)
  const longest = Math.floor(sampleRate / MIN_HZ)
  let speech = 0
  let voiced = 0
  for (let start = 0; start + frame < count; start += hop) {
    const end = start + frame - longest
    let energy = 0
    for (let i = start; i < start + frame; i++) energy += samples[i] * samples[i]
    if (Math.sqrt(energy / frame) < SILENCE_RMS) continue
    speech++
    let own = 0
    for (let i = start; i < end; i++) own += samples[i] * samples[i]
    for (let lag = shortest; lag <= longest; lag++) {
      let cross = 0
      let shifted = 0
      for (let i = start; i < end; i++) {
        cross += samples[i] * samples[i + lag]
        shifted += samples[i + lag] * samples[i + lag]
      }
      if (cross / Math.sqrt(own * shifted + 1e-12) > VOICED_CORRELATION) {
        voiced++
        break
      }
    }
  }
  return speech ? voiced / speech : 0
}
