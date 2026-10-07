import { sentenceTimes } from '../subtitles.js'
import { pcmToMp3 } from './encode.js'
import { normalizeMp3 } from './mp3.js'
import { decodeMp3, pausesIn, type DecodedAudio } from './pauses.js'

/** A sentence recorded again on its own, to go in place of sentence `index` */
export interface SentenceReplacement {
  index: number
  mp3: Buffer
}

// The silence kept around a replaced sentence: the halves of the pauses that were there, within these bounds
const MIN_GAP_MS = 80
const MAX_GAP_MS = 600
// A clip's own leading and trailing silence is trimmed to this
const EDGE_KEEP_MS = 30

const toSamples = (ms: number, rate: number) => Math.max(0, Math.round((ms / 1000) * rate))

/** Simple linear resampling, for the rare clip made at another rate */
function resample(samples: Float32Array, from: number, to: number) {
  if (from === to) return samples
  const out = new Float32Array(Math.round((samples.length * to) / from))
  for (let i = 0; i < out.length; i++) {
    const at = (i * from) / to
    const lo = Math.floor(at)
    const hi = Math.min(lo + 1, samples.length - 1)
    out[i] = samples[lo] + (samples[hi] - samples[lo]) * (at - lo)
  }
  return out
}

/** The speech in a clip, without its own leading and trailing silence */
function speechOnly(audio: DecodedAudio) {
  const duration = (audio.samples.length / audio.sampleRate) * 1000
  const pauses = pausesIn(audio)
  const leading = pauses.find((p) => p[0] <= 40)
  const trailing = pauses.find((p) => p[1] >= duration - 40 && p !== leading)
  const start = leading ? Math.max(leading[1] - EDGE_KEEP_MS, 0) : 0
  const end = trailing ? Math.min(trailing[0] + EDGE_KEEP_MS, duration) : duration
  return audio.samples.subarray(toSamples(start, audio.sampleRate), Math.max(toSamples(end, audio.sampleRate), toSamples(start, audio.sampleRate)))
}

function toPcm16(samples: Float32Array) {
  const out = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2)
  return out
}

/**
 * A part's recording with some sentences swapped for new recordings of just
 * those sentences, so fixing one line costs that line, not the whole part.
 * Sentences are found the way subtitles are (their share of the text, moved
 * onto the pauses), the old sentence is cut at the middle of the pauses around
 * it, and the new one goes in with the same silence either side.
 */
export async function spliceSentences(
  partMp3: Buffer,
  part: { text: string; sentences: { start: number; end: number }[] },
  replacements: SentenceReplacement[],
): Promise<{ mp3: Buffer; durationMs: number }> {
  const base = await decodeMp3(partMp3)
  const rate = base.sampleRate
  const durationMs = (base.samples.length / rate) * 1000
  const times = sentenceTimes({ text: part.text, sentences: part.sentences, durationMs, pauses: pausesIn(base) })

  // Sentence i runs from cut[i] to cut[i + 1], each cut in the middle of the pause between two sentences
  const cuts = [0, ...times.slice(1).map((t, i) => (times[i].endMs + t.startMs) / 2), durationMs]
  const byIndex = new Map(replacements.map((r) => [r.index, r]))
  const pieces: Float32Array[] = []
  for (let i = 0; i < times.length; i++) {
    const from = toSamples(cuts[i], rate)
    const to = toSamples(cuts[i + 1], rate)
    const replacement = byIndex.get(i)
    if (!replacement) {
      pieces.push(base.samples.subarray(from, to))
      continue
    }
    const fresh = await decodeMp3(replacement.mp3)
    const speech = resample(speechOnly(fresh), fresh.sampleRate, rate)
    const clamp = (ms: number) => Math.min(Math.max(ms, MIN_GAP_MS), MAX_GAP_MS)
    pieces.push(new Float32Array(toSamples(clamp(times[i].startMs - cuts[i]), rate)), speech, new Float32Array(toSamples(clamp(cuts[i + 1] - times[i].endMs), rate)))
  }

  const total = pieces.reduce((n, p) => n + p.length, 0)
  const joined = new Float32Array(total)
  let at = 0
  for (const p of pieces) {
    joined.set(p, at)
    at += p.length
  }
  const { audio, durationMs: measured } = normalizeMp3(pcmToMp3(toPcm16(joined), rate))
  return { mp3: audio, durationMs: measured || Math.round((total / rate) * 1000) }
}
