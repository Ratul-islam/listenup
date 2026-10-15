const WINDOW_MS = 50
// Quieter than this is silence or room noise, whatever the clip
const ABSOLUTE_GATE_DB = -50
// Windows this far under the clip's own speech are its pauses and breaths, not its level
const RELATIVE_GATE_DB = -15

// What a take is brought to: where Gemini's voices sit when they read plainly (stored clips,
// Oct 2026: −19 to −14 dB, middle −16), so audio made before this still matches. Kokoro's
// voices are steady on their own but 9 dB quieter (−25 dB every time), so they're brought here
// too: changing from a Natural voice to an Expressive one no longer changes the volume. The
// app does the same to the Natural voices it makes on the phone (KokoroVoiceModule.kt).
export const SPEECH_LEVEL_DB = -16.5
const MAX_BOOST_DB = 18
const MAX_CUT_DB = 12
// Peaks above this are rounded off instead of clipped, and none gets past the ceiling: an MP3 plays
// its peaks about a tenth higher than the audio it was made from, which took them over full scale.
// At the level Natural voices are brought to, this touches under 0.1% of a clip (Oct 2026).
const LIMIT_KNEE = 0.7
const LIMIT_CEILING = 0.85
// A take is never pushed further into that than this
const MAX_OVER_PEAK = 2.2

const toDb = (power: number) => 10 * Math.log10(power + 1e-12)

/**
 * How loud the speech in a clip is, in dB below full scale: the average over
 * the stretches where the voice is going, so pauses and a clip's silent ends
 * don't count. Null for a clip with no speech in it.
 */
export function speechLevel(samples: Float32Array, sampleRate: number) {
  const window = Math.max(1, Math.round((sampleRate * WINDOW_MS) / 1000))
  const powers: number[] = []
  for (let from = 0; from + window <= samples.length; from += window) {
    let sum = 0
    for (let i = from; i < from + window; i++) sum += samples[i] * samples[i]
    powers.push(sum / window)
  }
  const mean = (list: number[]) => list.reduce((n, p) => n + p, 0) / list.length
  const heard = powers.filter((p) => toDb(p) > ABSOLUTE_GATE_DB)
  if (!heard.length) return null
  const gate = toDb(mean(heard)) + RELATIVE_GATE_DB
  return toDb(mean(heard.filter((p) => toDb(p) > gate)))
}

// A take's first and last moments are faded, so one cut in the middle of a breath doesn't click where it's joined
const FADE_IN_MS = 5
const FADE_OUT_MS = 15

/** 16-bit mono PCM with its two ends faded in and out, in place */
export function fadeEdges(pcm: Buffer, sampleRate: number) {
  const count = Math.floor(pcm.length / 2)
  const fade = (samples: number, at: (i: number) => number) => {
    const n = Math.min(samples, Math.floor(count / 2))
    for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(pcm.readInt16LE(at(i) * 2) * (i / n)), at(i) * 2)
  }
  fade(Math.round((sampleRate * FADE_IN_MS) / 1000), (i) => i)
  fade(Math.round((sampleRate * FADE_OUT_MS) / 1000), (i) => count - 1 - i)
  return pcm
}

/** How loud the speech in 16-bit mono PCM is, in dB below full scale (see speechLevel) */
export function pcmLevel(pcm: Buffer, sampleRate: number) {
  const samples = new Float32Array(Math.floor(pcm.length / 2))
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768
  return speechLevel(samples, sampleRate)
}

/**
 * 16-bit mono PCM with its speech brought to `targetDb`. Takes voiced one by
 * one come back at very different volumes (measured up to 15 dB apart inside
 * one part, by voice and by direction), which is heard as the reader changing.
 * Loud peaks are rounded off, not clipped.
 */
export function levelPcm(pcm: Buffer, sampleRate: number, targetDb = SPEECH_LEVEL_DB) {
  const count = Math.floor(pcm.length / 2)
  const samples = new Float32Array(count)
  let peak = 0
  for (let i = 0; i < count; i++) {
    samples[i] = pcm.readInt16LE(i * 2) / 32768
    peak = Math.max(peak, Math.abs(samples[i]))
  }
  const level = speechLevel(samples, sampleRate)
  if (level === null || !peak) return pcm
  const wanted = Math.min(Math.max(targetDb - level, -MAX_CUT_DB), MAX_BOOST_DB)
  const gain = Math.min(10 ** (wanted / 20), MAX_OVER_PEAK / peak)
  if (Math.abs(gain - 1) < 0.03) return pcm

  const out = Buffer.alloc(count * 2)
  const room = LIMIT_CEILING - LIMIT_KNEE
  for (let i = 0; i < count; i++) {
    const v = samples[i] * gain
    const size = Math.abs(v)
    const limited = size <= LIMIT_KNEE ? size : LIMIT_KNEE + room * Math.tanh((size - LIMIT_KNEE) / room)
    out.writeInt16LE(Math.round(Math.sign(v) * limited * 32767), i * 2)
  }
  return out
}
