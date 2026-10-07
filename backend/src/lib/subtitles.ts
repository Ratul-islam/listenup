import type { Pause } from './audio/pauses.js'

/** One voiced part of a document, placed on the full recording's timeline */
export interface SubtitlePart {
  /** The text as written (subtitles show the script, not pronunciation respellings) */
  text: string
  /** Sentence character ranges within `text` */
  sentences: { start: number; end: number }[]
  /** Where this part starts in the whole recording */
  offsetMs: number
  durationMs: number
  /** Silences within this part's audio */
  pauses: Pause[]
  /** Japanese and Chinese: no spaces, more meaning per character, so shorter lines */
  cjk?: boolean
}

export interface Cue {
  startMs: number
  endMs: number
  text: string
}

/**
 * Caption sizes. Standard follows Netflix-style limits (two lines of at most 42
 * characters); short is one line of up to 32, for Reels, Shorts and TikTok,
 * where captions sit large in the middle of a vertical video.
 */
export type CaptionStyle = 'standard' | 'short'
const STYLES: Record<CaptionStyle, { line: number; lineCjk: number; lines: number }> = {
  standard: { line: 42, lineCjk: 16, lines: 2 },
  short: { line: 32, lineCjk: 12, lines: 1 },
}
type Size = { line: number; lines: number }
// How far a boundary may move to land on a pause: further at sentence ends, where pauses are longer
const SNAP_SENTENCE_MS = 1500
const SNAP_PHRASE_MS = 600
// A pause at the very start or end of a clip is the clip's own silence
const EDGE_MS = 40
// Captions stay up a moment into a pause, and the next comes up just before the voice
const HOLD_MS = 150
const LEAD_MS = 60
const MIN_CUE_MS = 400

const CLAUSE_END = /[,;:，、；،—–]$/u

/** Sentence pieces short enough for one caption, broken at commas where possible */
function splitSentence(sentence: string, cjk: boolean, size: Size): string[] {
  const max = size.line * size.lines
  if (sentence.length <= max) return [sentence]
  const pieces: string[] = []
  let rest = sentence
  while (rest.length > max) {
    // Even pieces read better than a full caption and a two-word one
    const target = Math.ceil(rest.length / Math.ceil(rest.length / max))
    const window = rest.slice(0, max + 1)
    let cut = -1
    // A clause break near the even length reads best; then the space nearest it; then a hard cut
    for (let i = window.length - 1; i > target * 0.6; i--) {
      if (CLAUSE_END.test(window.slice(0, i))) {
        cut = i
        break
      }
    }
    if (cut < 0 && !cjk) {
      for (let i = window.indexOf(' '); i >= 0; i = window.indexOf(' ', i + 1)) {
        if (cut < 0 || Math.abs(i - target) < Math.abs(cut - target)) cut = i
      }
      if (cut < max * 0.3) cut = -1
    }
    if (cut < 0) cut = cjk ? target : max
    pieces.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) pieces.push(rest)
  return pieces.filter(Boolean)
}

/** Two balanced lines when a caption is longer than one */
function wrap(text: string, cjk: boolean, size: Size) {
  const line = size.line
  if (size.lines < 2 || text.length <= line) return text
  const middle = text.length / 2
  if (cjk) return `${text.slice(0, Math.ceil(middle))}\n${text.slice(Math.ceil(middle))}`
  let best = -1
  for (let i = text.indexOf(' '); i >= 0; i = text.indexOf(' ', i + 1)) {
    if (best < 0 || Math.abs(i - middle) < Math.abs(best - middle)) best = i
  }
  return best < 0 ? text : `${text.slice(0, best)}\n${text.slice(best + 1)}`
}

/**
 * Timed captions for a part: each caption's place is estimated from its share
 * of the text, then moved onto the nearest pause in the audio, so captions
 * change when the voice actually stops between sentences and phrases.
 */
function partCues(part: SubtitlePart, style: CaptionStyle, split = true): (Cue & { sentence: number })[] {
  const cjk = !!part.cjk
  const size = { line: cjk ? STYLES[style].lineCjk : STYLES[style].line, lines: STYLES[style].lines }
  const spans = part.sentences.length ? part.sentences : [{ start: 0, end: part.text.length }]
  const pieces = spans
    .flatMap((s, si) => {
      const sentence = part.text.slice(s.start, s.end).replace(/\s+/g, ' ').trim()
      const parts = !sentence ? [] : split ? splitSentence(sentence, cjk, size) : [sentence]
      return parts.map((text, i) => ({ text, sentence: si, sentenceEnd: i === parts.length - 1, last: false }))
    })
    .map((p, i, all) => ({ ...p, last: i === all.length - 1 }))
  if (!pieces.length) return []

  const leading = part.pauses.find((p) => p[0] <= EDGE_MS)
  const trailing = part.pauses.find((p) => p[1] >= part.durationMs - EDGE_MS && p !== leading)
  const speechStart = leading ? Math.min(leading[1], part.durationMs) : 0
  const speechEnd = Math.max(trailing ? trailing[0] : part.durationMs, speechStart + 1)
  const inner = part.pauses.filter((p) => p !== leading && p !== trailing)

  // Pauses at sentence ends and commas take time too
  const weight = (p: (typeof pieces)[number]) => p.text.length + (p.sentenceEnd ? 8 : CLAUSE_END.test(p.text) ? 3 : 0)
  const total = pieces.reduce((n, p) => n + weight(p), 0)
  const span = speechEnd - speechStart

  const cues: (Cue & { sentence: number })[] = []
  let start = speechStart
  let used = -1
  let done = 0
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]
    done += weight(piece)
    let end = speechEnd
    let next = speechEnd
    if (!piece.last) {
      const estimate = speechStart + (done / total) * span
      const reach = piece.sentenceEnd ? SNAP_SENTENCE_MS : SNAP_PHRASE_MS
      let pick = -1
      for (let k = used + 1; k < inner.length; k++) {
        const middle = (inner[k][0] + inner[k][1]) / 2
        if (inner[k][0] < start + MIN_CUE_MS) continue
        if (Math.abs(middle - estimate) > reach) continue
        if (pick < 0 || Math.abs(middle - estimate) < Math.abs((inner[pick][0] + inner[pick][1]) / 2 - estimate)) pick = k
      }
      if (pick >= 0) {
        used = pick
        end = Math.min(inner[pick][0] + HOLD_MS, inner[pick][1])
        next = Math.max(inner[pick][1] - LEAD_MS, end)
      } else {
        end = next = Math.max(estimate, start + MIN_CUE_MS)
      }
    }
    end = Math.min(Math.max(end, start + 1), part.durationMs)
    cues.push({ startMs: Math.round(part.offsetMs + start), endMs: Math.round(part.offsetMs + end), text: wrap(piece.text, cjk, size), sentence: piece.sentence })
    start = Math.min(next, part.durationMs)
  }
  return cues
}

export function buildCues(parts: SubtitlePart[], style: CaptionStyle = 'standard'): Cue[] {
  return parts
    .flatMap((p) => partCues(p, style))
    .filter((c) => c.endMs > c.startMs)
    .map(({ startMs, endMs, text }) => ({ startMs, endMs, text }))
}

/**
 * Where each sentence of a part is spoken in its audio, moved onto the pauses
 * between sentences: what "Redo this sentence" cuts out and replaces. Sentences
 * with no words get a zero-length span at the end of the one before.
 */
export function sentenceTimes(part: Omit<SubtitlePart, 'offsetMs'>): { startMs: number; endMs: number }[] {
  const cues = partCues({ ...part, offsetMs: 0 }, 'standard', false)
  const count = Math.max(part.sentences.length, 1)
  const times: { startMs: number; endMs: number }[] = []
  let last = 0
  for (let i = 0; i < count; i++) {
    const cue = cues.find((c) => c.sentence === i)
    times.push(cue ? { startMs: cue.startMs, endMs: cue.endMs } : { startMs: last, endMs: last })
    last = cue?.endMs ?? last
  }
  return times
}

/** The script as plain text, one paragraph per part (for video descriptions) */
export const toTranscript = (parts: { text: string }[]) => `${parts.map((p) => p.text.trim()).join('\n\n')}\n`

const stamp = (ms: number, separator: ',' | '.') => {
  const t = Math.max(0, Math.round(ms))
  const h = Math.floor(t / 3_600_000)
  const m = Math.floor((t % 3_600_000) / 60_000)
  const s = Math.floor((t % 60_000) / 1000)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(t % 1000, 3)}`
}

/** SubRip, the file most video editors (CapCut, Premiere, YouTube Studio) take */
export const toSrt = (cues: Cue[]) =>
  cues.map((c, i) => `${i + 1}\n${stamp(c.startMs, ',')} --> ${stamp(c.endMs, ',')}\n${c.text}\n`).join('\n')

/** WebVTT, for the web and some editors */
export const toVtt = (cues: Cue[]) =>
  `WEBVTT\n\n${cues.map((c) => `${stamp(c.startMs, '.')} --> ${stamp(c.endMs, '.')}\n${c.text}\n`).join('\n')}`
