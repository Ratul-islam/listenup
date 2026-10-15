import { FRAME_MS, measure, pcmOfSamples, samplesOfPcm } from './prosody.js'
import { reshape, type Fit } from './reshape.js'

/** A steady change to a voice: its pace (1 is its own) and its pitch, in semitones (0 is its own) */
export interface VoiceAdjust {
  speed: number
  pitch: number
}

export const isAdjusted = (adjust: Partial<VoiceAdjust> | null | undefined): adjust is VoiceAdjust =>
  !!adjust && ((adjust.speed ?? 1) !== 1 || (adjust.pitch ?? 0) !== 0)

/**
 * Speech at another pace or pitch, still in its own voice: its pitch periods are laid
 * down again further apart or closer together (see reshape), so the voice keeps the
 * sound of its mouth and throat, where playing it faster or slower would make it
 * squeak or boom. Pauses stretch with the words.
 */
export function adjustPcm(pcm: Buffer, sampleRate: number, { speed, pitch }: VoiceAdjust): Buffer {
  const samples = samplesOfPcm(pcm)
  const take = measure(samples, sampleRate)
  if (!take.frames) return pcm
  const frames = Math.max(1, Math.round(take.frames / speed))
  const factor = 2 ** (pitch / 12)
  const sourceMs = new Float32Array(frames)
  const pitchHz = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    sourceMs[f] = f * FRAME_MS * speed
    // Where the take has no voice (a hiss, a stop) its own sound is left as it is
    const own = take.f0[Math.min(take.frames - 1, Math.round(f * speed))]
    pitchHz[f] = own > 0 ? own * factor : 0
  }
  const plan: Fit = {
    sourceMs,
    pitchHz,
    gainDb: new Float32Array(frames),
    from: 0,
    to: frames,
    mismatch: 0,
    stretch: Math.abs(Math.log2(speed)),
    bend: Math.abs(pitch),
  }
  return pcmOfSamples(reshape(samples, sampleRate, take, plan))
}
