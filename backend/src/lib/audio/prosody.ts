import { pausesIn } from './pauses.js'

/**
 * How a stretch of speech is said, measured from its sound every 10 ms: the
 * pitch of the voice, how loud it is, what sound is being made, and where the
 * speaker stops. Two people saying the same words can be lined up sound by
 * sound from this (see reshape), whatever their voices are like.
 */
export interface Prosody {
  frames: number
  /** Pitch in Hz; 0 where the voice isn't going (a breathy or hissed sound, a whisper, silence) */
  f0: Float32Array
  /** Loudness in dB below full scale */
  energy: Float32Array
  /** The sound being made, as MFCC_DIMS numbers a frame, evened out over the clip so the microphone and the speaker matter less */
  mfcc: Float32Array
  /** 1 where someone is speaking, 0 in the stops and at the silent ends */
  speech: Uint8Array
  /** The speaker's usual pitch (the middle of their voiced frames), 0 when nothing is voiced */
  medianHz: number
  /** How loud the speech is, in dB (frames with speech only) */
  levelDb: number
}

export const FRAME_MS = 10
export const MFCC_DIMS = 12

const MIN_HZ = 65
const MAX_HZ = 450
// Pitch is found on the sound below about 1 kHz at half the rate: the voice's own beat, without the mouth's resonances
const PITCH_WINDOW_MS = 30
// How alike two neighbouring periods must be for a frame to count as voiced
const VOICED_CORRELATION = 0.5
// A beat twice as long fits a voice as well as the real one; the shortest that fits nearly as well is taken
const NEAR_BEST = 0.85
// Quieter than this under the speech, a frame has no pitch worth reading
const VOICED_FLOOR_DB = 35

const MFCC_WINDOW_MS = 25
const MEL_FILTERS = 24
const MEL_LOW_HZ = 100
const MEL_HIGH_HZ = 7000

/** 16-bit mono PCM as samples from −1 to 1 */
export function samplesOfPcm(pcm: Buffer) {
  const samples = new Float32Array(Math.floor(pcm.length / 2))
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768
  return samples
}

/** Samples from −1 to 1 as 16-bit mono PCM */
export function pcmOfSamples(samples: Float32Array) {
  const pcm = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2)
  return pcm
}

const median = (values: number[]) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** The sound below about 1 kHz, at half the sample rate */
function lowHalf(samples: Float32Array) {
  const half = new Float32Array(Math.floor(samples.length / 2))
  for (let i = 0; i < half.length; i++) {
    const at = i * 2
    half[i] = (samples[at] + (samples[at + 1] ?? 0)) / 2
  }
  // A running mean over 6 samples (first null at a sixth of the rate)
  const out = new Float32Array(half.length)
  let sum = 0
  for (let i = 0; i < half.length; i++) {
    sum += half[i] - (i >= 6 ? half[i - 6] : 0)
    out[i] = sum / 6
  }
  return out
}

/** Pitch per frame in Hz (0 where unvoiced), by how well each stretch repeats itself one period later */
function pitchOf(samples: Float32Array, sampleRate: number, frames: number, energy: Float32Array, levelDb: number) {
  const low = lowHalf(samples)
  const rate = sampleRate / 2
  const hop = (rate * FRAME_MS) / 1000
  const window = Math.round((rate * PITCH_WINDOW_MS) / 1000)
  const shortest = Math.floor(rate / MAX_HZ)
  const longest = Math.ceil(rate / MIN_HZ)
  const f0 = new Float32Array(frames)
  const fit = new Float32Array(longest + 2)
  for (let f = 0; f < frames; f++) {
    if (energy[f] < levelDb - VOICED_FLOOR_DB) continue
    const start = Math.round(f * hop - (window + longest) / 2)
    if (start < 0 || start + window + longest + 1 >= low.length) continue
    let own = 0
    for (let i = start; i < start + window; i++) own += low[i] * low[i]
    if (own < 1e-9) continue
    let best = 0
    for (let lag = shortest - 1; lag <= longest + 1; lag++) {
      let cross = 0
      let shifted = 0
      for (let i = start; i < start + window; i++) {
        cross += low[i] * low[i + lag]
        shifted += low[i + lag] * low[i + lag]
      }
      fit[lag] = cross / Math.sqrt(own * shifted + 1e-12)
      if (lag >= shortest && lag <= longest && fit[lag] > best) best = fit[lag]
    }
    if (best < VOICED_CORRELATION) continue
    for (let lag = shortest; lag <= longest; lag++) {
      if (fit[lag] < best * NEAR_BEST || fit[lag] < fit[lag - 1] || fit[lag] < fit[lag + 1]) continue
      // The peak lies between samples: a curve through its neighbours says where
      const curve = fit[lag - 1] - 2 * fit[lag] + fit[lag + 1]
      const exact = lag + (curve < 0 ? (0.5 * (fit[lag - 1] - fit[lag + 1])) / curve : 0)
      f0[f] = rate / exact
      break
    }
  }
  return tidyPitch(f0)
}

/** Pitch without its reading mistakes: octave slips put back, lone frames dropped, short gaps bridged */
function tidyPitch(f0: Float32Array) {
  const frames = f0.length
  const out = Float32Array.from(f0)
  // A frame an octave away from the voiced frames around it was read at half or double the beat
  for (let f = 0; f < frames; f++) {
    if (!f0[f]) continue
    const around: number[] = []
    for (let k = Math.max(0, f - 8); k <= Math.min(frames - 1, f + 8); k++) if (f0[k] && k !== f) around.push(f0[k])
    if (around.length < 4) continue
    const usual = median(around)
    for (const fixed of [f0[f] / 2, f0[f] * 2]) {
      if (Math.abs(Math.log2(fixed / usual)) + 0.35 < Math.abs(Math.log2(f0[f] / usual))) out[f] = fixed
    }
  }
  // Voiced for under three frames isn't a voice; unvoiced for one or two inside a voiced stretch is a missed reading
  for (let f = 0; f < frames; ) {
    let end = f
    while (end < frames && !!out[end] === !!out[f]) end++
    const length = end - f
    if (out[f] && length < 3) out.fill(0, f, end)
    else if (!out[f] && length <= 2 && f > 0 && end < frames && out[f - 1] && out[end]) {
      for (let k = f; k < end; k++) out[k] = out[f - 1] + ((out[end] - out[f - 1]) * (k - f + 1)) / (length + 1)
    }
    f = end
  }
  // A middle-of-three smoothing inside voiced stretches
  const smooth = Float32Array.from(out)
  for (let f = 1; f + 1 < frames; f++) if (out[f - 1] && out[f] && out[f + 1]) smooth[f] = median([out[f - 1], out[f], out[f + 1]])
  return smooth
}

/** In-place FFT of a power-of-two length */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size
    const stepRe = Math.cos(angle)
    const stepIm = Math.sin(angle)
    for (let start = 0; start < n; start += size) {
      let wRe = 1
      let wIm = 0
      for (let k = 0; k < size / 2; k++) {
        const a = start + k
        const b = a + size / 2
        const tRe = re[b] * wRe - im[b] * wIm
        const tIm = re[b] * wIm + im[b] * wRe
        re[b] = re[a] - tRe
        im[b] = im[a] - tIm
        re[a] += tRe
        im[a] += tIm
        const next = wRe * stepRe - wIm * stepIm
        wIm = wRe * stepIm + wIm * stepRe
        wRe = next
      }
    }
  }
}

const mel = (hz: number) => 2595 * Math.log10(1 + hz / 700)
const hzOfMel = (m: number) => 700 * (10 ** (m / 2595) - 1)

/** The sound of each frame as cepstral numbers (what's said, not who says it or how loud) */
function mfccOf(samples: Float32Array, sampleRate: number, frames: number) {
  const hop = (sampleRate * FRAME_MS) / 1000
  const window = Math.round((sampleRate * MFCC_WINDOW_MS) / 1000)
  let size = 1
  while (size < window) size <<= 1
  const bins = size / 2 + 1
  const top = Math.min(MEL_HIGH_HZ, sampleRate / 2 - 200)
  const edges = Array.from({ length: MEL_FILTERS + 2 }, (_, i) => (hzOfMel(mel(MEL_LOW_HZ) + ((mel(top) - mel(MEL_LOW_HZ)) * i) / (MEL_FILTERS + 1)) * size) / sampleRate)
  const hamming = Float32Array.from({ length: window }, (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (window - 1)))
  const out = new Float32Array(frames * MFCC_DIMS)
  const re = new Float32Array(size)
  const im = new Float32Array(size)
  const power = new Float32Array(bins)
  const bands = new Float32Array(MEL_FILTERS)
  for (let f = 0; f < frames; f++) {
    const start = Math.round(f * hop - window / 2)
    re.fill(0)
    im.fill(0)
    for (let i = 0; i < window; i++) {
      const at = start + i
      if (at < 1 || at >= samples.length) continue
      // The high sounds are lifted first, as speech loses loudness towards them
      re[i] = (samples[at] - 0.97 * samples[at - 1]) * hamming[i]
    }
    fft(re, im)
    for (let b = 0; b < bins; b++) power[b] = re[b] * re[b] + im[b] * im[b]
    for (let m = 0; m < MEL_FILTERS; m++) {
      let sum = 0
      for (let b = Math.ceil(edges[m]); b <= Math.floor(edges[m + 2]) && b < bins; b++) {
        sum += power[b] * (b <= edges[m + 1] ? (b - edges[m]) / (edges[m + 1] - edges[m]) : (edges[m + 2] - b) / (edges[m + 2] - edges[m + 1]))
      }
      bands[m] = Math.log(sum + 1e-10)
    }
    for (let c = 1; c <= MFCC_DIMS; c++) {
      let sum = 0
      for (let m = 0; m < MEL_FILTERS; m++) sum += bands[m] * Math.cos((Math.PI * c * (m + 0.5)) / MEL_FILTERS)
      out[f * MFCC_DIMS + c - 1] = sum
    }
  }
  return out
}

/** Each cepstral number brought to the same middle and spread over the frames with speech in them */
function evenOut(mfcc: Float32Array, speech: Uint8Array) {
  const frames = speech.length
  const count = speech.reduce((n, s) => n + s, 0) || 1
  for (let c = 0; c < MFCC_DIMS; c++) {
    let mean = 0
    for (let f = 0; f < frames; f++) if (speech[f]) mean += mfcc[f * MFCC_DIMS + c]
    mean /= count
    let spread = 0
    for (let f = 0; f < frames; f++) if (speech[f]) spread += (mfcc[f * MFCC_DIMS + c] - mean) ** 2
    spread = Math.sqrt(spread / count) || 1
    for (let f = 0; f < frames; f++) mfcc[f * MFCC_DIMS + c] = (mfcc[f * MFCC_DIMS + c] - mean) / spread
  }
}

// A stop is at least this long; a shorter dip is inside a word
const MIN_STOP_FRAMES = 12
// Speech for less than this is a click or a knock, not a word
const MIN_SPEECH_FRAMES = 6
// A microphone recording: its speech has to stand this far above the room for its stops to be told from it
const MIN_RANGE_DB = 12

/**
 * Where there's speech in a recording made with a microphone. A voice from
 * the speech service has silent stops; a room never is, so the line between
 * speech and stop is drawn from the recording's own quietest and loudest
 * tenths. Nothing is speech when the two are too close to tell apart.
 */
function speechInRecording(energy: Float32Array) {
  const frames = energy.length
  const sorted = Float32Array.from(energy).sort()
  const floor = sorted[Math.floor(frames * 0.1)] ?? -120
  const top = sorted[Math.floor(frames * 0.95)] ?? -120
  const speech = new Uint8Array(frames)
  if (top - floor < MIN_RANGE_DB) return speech
  const line = floor + Math.max(8, 0.35 * (top - floor))
  for (let f = 0; f < frames; f++) speech[f] = energy[f] > line ? 1 : 0
  return speech
}

/** A speech mask without its flickers: dips too short to be stops are speech, and blips too short to be words aren't */
function steady(speech: Uint8Array) {
  const runs = (value: number, shorterThan: number, inner: boolean) => {
    for (let f = 0; f < speech.length; ) {
      let end = f
      while (end < speech.length && speech[end] === speech[f]) end++
      if (speech[f] === value && end - f < shorterThan && (!inner || (f > 0 && end < speech.length))) speech.fill(1 - value, f, end)
      f = end
    }
  }
  runs(0, MIN_STOP_FRAMES, true)
  runs(1, MIN_SPEECH_FRAMES, false)
  return speech
}

/**
 * Measures speech (mono samples from −1 to 1). `recording` is for one made
 * with a microphone, where the room is heard between the words.
 */
export function measure(samples: Float32Array, sampleRate: number, { recording = false } = {}): Prosody {
  const hop = (sampleRate * FRAME_MS) / 1000
  const frames = Math.floor(samples.length / hop)
  const window = Math.round((sampleRate * MFCC_WINDOW_MS) / 1000)
  const energy = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    const start = Math.max(0, Math.round(f * hop - window / 2))
    const end = Math.min(samples.length, start + window)
    let sum = 0
    for (let i = start; i < end; i++) sum += samples[i] * samples[i]
    energy[f] = 10 * Math.log10(sum / Math.max(end - start, 1) + 1e-12)
  }
  let speech = new Uint8Array(frames).fill(1)
  if (recording) speech = speechInRecording(energy)
  else for (const [from, to] of pausesIn({ samples, sampleRate })) speech.fill(0, Math.ceil(from / FRAME_MS), Math.min(frames, Math.floor(to / FRAME_MS)))
  steady(speech)
  let power = 0
  let spoken = 0
  for (let f = 0; f < frames; f++) {
    if (!speech[f]) continue
    power += 10 ** (energy[f] / 10)
    spoken++
  }
  const levelDb = spoken ? 10 * Math.log10(power / spoken + 1e-12) : -120
  const f0 = pitchOf(samples, sampleRate, frames, energy, levelDb)
  // A pitch read in a stop is the room, not the voice
  for (let f = 0; f < frames; f++) if (!speech[f]) f0[f] = 0
  const mfcc = mfccOf(samples, sampleRate, frames)
  evenOut(mfcc, speech)
  return { frames, f0, energy, mfcc, speech, medianHz: median(Array.from(f0).filter((hz) => hz > 0)), levelDb }
}

/** The share of the speech that's voiced (a whisper has almost none) */
export const voicedShareOf = (p: Prosody) => {
  let spoken = 0
  let voiced = 0
  for (let f = 0; f < p.frames; f++) {
    if (!p.speech[f]) continue
    spoken++
    if (p.f0[f]) voiced++
  }
  return spoken ? voiced / spoken : 0
}

/**
 * How someone said a line, kept so the line can be voiced that way again: the
 * measurements, not the recording. It holds the tune, the loudness, the
 * timing and a coarse outline of each sound (evened out, which removes much
 * of what a microphone and a particular mouth add). It's still made from a
 * person's speech, so it's kept and deleted with their document.
 */
export interface Performance {
  v: 1
  frames: number
  medianHz: number
  /** Pitch as quarter semitones from the speaker's usual pitch (−128 where unvoiced), base64 */
  f0: string
  /** Loudness as half dB from their speech level, base64 */
  energy: string
  /** The outline of each sound, base64 */
  mfcc: string
  /** Where they're speaking, base64 */
  speech: string
}

const clamp8 = (v: number) => Math.max(-127, Math.min(127, Math.round(v)))

export function packPerformance(p: Prosody): Performance {
  const f0 = new Int8Array(p.frames)
  const energy = new Int8Array(p.frames)
  for (let f = 0; f < p.frames; f++) {
    f0[f] = p.f0[f] && p.medianHz ? clamp8(48 * Math.log2(p.f0[f] / p.medianHz)) : -128
    energy[f] = clamp8((p.energy[f] - p.levelDb) * 2)
  }
  const mfcc = Int8Array.from(p.mfcc, (v) => clamp8(v * 32))
  const b64 = (a: Int8Array | Uint8Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64')
  return { v: 1, frames: p.frames, medianHz: Math.round(p.medianHz), f0: b64(f0), energy: b64(energy), mfcc: b64(mfcc), speech: b64(p.speech) }
}

/** A kept performance as measurements again; null when it can't be read */
export function unpackPerformance(value: unknown): Prosody | null {
  const saved = value as Partial<Performance> | null
  if (!saved || saved.v !== 1 || !Number.isInteger(saved.frames) || typeof saved.f0 !== 'string' || typeof saved.energy !== 'string' || typeof saved.mfcc !== 'string' || typeof saved.speech !== 'string') return null
  const frames = saved.frames!
  const bytes = (text: string) => Buffer.from(text, 'base64')
  const [f0, energy, mfcc, speech] = [bytes(saved.f0), bytes(saved.energy), bytes(saved.mfcc), bytes(saved.speech)]
  if (f0.length !== frames || energy.length !== frames || speech.length !== frames || mfcc.length !== frames * MFCC_DIMS) return null
  const medianHz = saved.medianHz ?? 0
  return {
    frames,
    f0: Float32Array.from(f0, (b) => ((b << 24) >> 24 === -128 || !medianHz ? 0 : medianHz * 2 ** (((b << 24) >> 24) / 48))),
    // Loudness is kept against the speaker's own level, which is all that's used
    energy: Float32Array.from(energy, (b) => ((b << 24) >> 24) / 2),
    mfcc: Float32Array.from(mfcc, (b) => ((b << 24) >> 24) / 32),
    speech: Uint8Array.from(speech),
    medianHz,
    levelDb: 0,
  }
}
