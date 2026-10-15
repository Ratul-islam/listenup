import type { Pause } from './pauses.js'

/** A moment in a part's audio and the character being spoken then: [character offset, ms] */
export type TextAnchor = [number, number]

interface Span {
  start: number
  end: number
}

export interface AlignInput {
  /** The text as written */
  text: string
  /** Sentence character ranges within `text` */
  sentences: Span[]
  durationMs: number
  /** Silences in the audio */
  pauses: Pause[]
}

// A pause at the very start or end of a clip is the clip's own silence
const EDGE_MS = 40
// A sentence end may sit this far (in speech time) from where its share of the text puts it
const MAX_OFF_MS = 2500
const MAX_OFF_SHARE = 0.3
// Voices stop longer between sentences than at commas: every ms of pause is worth this much closeness
const PAUSE_WEIGHT = 1.2
const PAUSE_CAP_MS = 700
// What leaving a sentence end without a pause costs (it's then placed by its share of the text)
const UNMATCHED_COST = 900
const CLAUSE_BREAK = /[,;:—–…，、；،।]/u

const HAS_WORD = /[\p{L}\p{N}]/u

/** A stretch of the text and when it's spoken */
interface Timed extends Span {
  startMs: number
  endMs: number
}

/**
 * The text in the pieces it's timed by, in order. A recording made in one go
 * is timed sentence by sentence, from its silences. One joined from several
 * takes (a character's lines among the narrator's) is known exactly at every
 * join, and its takes are spoken at different paces, so each take is timed on
 * its own, and a sentence shared by two takes is two pieces. Timed as one
 * recording, a short reply was given ten milliseconds and the line before it
 * the time of both, so the wrong line (and the wrong character's name) showed
 * while it was spoken (Oct 2026).
 */
function timedPieces(part: AlignInput): Timed[] {
  const spans = part.sentences.length ? part.sentences : [{ start: 0, end: part.text.length }]
  const joins = part.pauses.filter((p): p is [number, number, number] => p[2] !== undefined && p[2] > 0 && p[2] < part.text.length)
  // Out of order (they never should be), nothing can be said about the takes
  const ordered = joins.every((p, i) => i === 0 || (p[2] > joins[i - 1][2] && p[0] >= joins[i - 1][1]))
  if (!joins.length || !ordered) return alignWhole({ ...part, sentences: spans }).map((t, i) => ({ ...spans[i], ...t }))

  const pieces: Timed[] = []
  for (let k = 0; k <= joins.length; k++) {
    const from = k ? joins[k - 1][2] : 0
    const to = k < joins.length ? joins[k][2] : part.text.length
    const startMs = k ? joins[k - 1][1] : 0
    const endMs = Math.max(k < joins.length ? joins[k][0] : part.durationMs, startMs)
    const inside = spans.map((s) => ({ start: Math.max(s.start, from), end: Math.min(s.end, to) })).filter((s) => s.end > s.start)
    if (!inside.length) continue
    const pauses = part.pauses.filter((p) => p[0] >= startMs && p[1] <= endMs && p[1] > p[0]).map((p): Pause => [p[0] - startMs, p[1] - startMs])
    const times = alignWhole({ text: part.text, sentences: inside, durationMs: endMs - startMs, pauses })
    inside.forEach((s, i) => pieces.push({ ...s, startMs: times[i].startMs + startMs, endMs: times[i].endMs + startMs }))
  }
  return pieces
}

/** Where each sentence is spoken, in ms (see alignWhole; joined recordings are timed take by take) */
export function alignSentences(part: AlignInput): { startMs: number; endMs: number }[] {
  const spans = part.sentences.length ? part.sentences : [{ start: 0, end: part.text.length }]
  const pieces = timedPieces(part)
  let last = 0
  return spans.map((s) => {
    const own = pieces.filter((p) => p.start < s.end && p.end > s.start && p.endMs > p.startMs)
    const time = own.length ? { startMs: own[0].startMs, endMs: own[own.length - 1].endMs } : { startMs: last, endMs: last }
    last = time.endMs
    return time
  })
}

/**
 * Where each sentence is spoken, in ms. Speech services don't say, so it's
 * worked out from the silences: text is spoken at a steady rate while the
 * voice is going (pauses are what vary), so each sentence end is matched to the
 * pause nearest its share of the *speaking* time, longer pauses preferred, in
 * order. Measured against clips with known joins (Oct 2026), this is within a
 * few ms where matching by clock time was off by more than a second.
 * Sentences with no words get an empty span at the end of the one before.
 */
function alignWhole({ text, sentences, durationMs, pauses }: AlignInput): { startMs: number; endMs: number }[] {
  const spans = sentences.length ? sentences : [{ start: 0, end: text.length }]
  const leading = pauses.find((p) => p[0] <= EDGE_MS)
  const trailing = pauses.find((p) => p[1] >= durationMs - EDGE_MS && p !== leading)
  const speechStart = leading ? Math.min(leading[1], durationMs) : 0
  const speechEnd = Math.max(trailing ? trailing[0] : durationMs, speechStart + 1)
  const inner = pauses.filter((p) => p !== leading && p !== trailing && p[0] > speechStart && p[1] < speechEnd)

  // Speaking time (silences left out) before each pause, and in all
  const spokenBefore: number[] = []
  let silent = 0
  for (const p of inner) {
    spokenBefore.push(p[0] - speechStart - silent)
    silent += p[1] - p[0]
  }
  const spokenMs = Math.max(speechEnd - speechStart - silent, 1)
  /** The clock time at which this much has been spoken */
  const clockAt = (spoken: number) => {
    let at = speechStart + spoken
    for (let k = 0; k < inner.length && spokenBefore[k] < spoken; k++) at += inner[k][1] - inner[k][0]
    return Math.min(at, speechEnd)
  }

  const worded = spans.map((s, i) => ({ ...s, i })).filter((s) => HAS_WORD.test(text.slice(s.start, s.end)))
  const letters = (s: Span) => text.slice(s.start, s.end).replace(/\s+/g, '').length
  const total = Math.max(worded.reduce((n, s) => n + letters(s), 0), 1)
  // Where each sentence but the last should end, as speaking time
  const targets: number[] = []
  let done = 0
  for (const s of worded.slice(0, -1)) targets.push(((done += letters(s)) / total) * spokenMs)

  // Best pause for each sentence end, in order: least distance from its target, less the pause's length
  const reach = Math.min(MAX_OFF_MS, Math.max(spokenMs * MAX_OFF_SHARE, 600))
  const costOf = (b: number, k: number) => {
    const off = Math.abs(spokenBefore[k] - targets[b])
    return off > reach ? Infinity : off - PAUSE_WEIGHT * Math.min(inner[k][1] - inner[k][0], PAUSE_CAP_MS)
  }
  const B = targets.length
  const K = inner.length
  // best[b][k]: least cost of the first b ends using only the first k pauses; pick[b][k]: the pause end b-1 took (-1: none)
  const best = Array.from({ length: B + 1 }, () => new Array<number>(K + 1).fill(0))
  const pick = Array.from({ length: B + 1 }, () => new Array<number>(K + 1).fill(-1))
  for (let b = 1; b <= B; b++) {
    for (let k = 0; k <= K; k++) {
      // End b-1 has no pause of its own…
      let cost = best[b - 1][k] + UNMATCHED_COST
      let chosen = -1
      // …or takes pause k-1, or whatever was best among the pauses before it
      if (k > 0) {
        if (best[b][k - 1] < cost) {
          cost = best[b][k - 1]
          chosen = pick[b][k - 1]
        }
        const taken = best[b - 1][k - 1] + costOf(b - 1, k - 1)
        if (taken < cost) {
          cost = taken
          chosen = k - 1
        }
      }
      best[b][k] = cost
      pick[b][k] = chosen
    }
  }
  const matched = new Array<number>(B).fill(-1)
  for (let b = B, k = K; b > 0; b--) {
    const chosen = pick[b][k]
    matched[b - 1] = chosen
    if (chosen >= 0) k = chosen
  }

  const times: { startMs: number; endMs: number }[] = []
  let cursor = speechStart
  let w = 0
  let last = speechStart
  for (let i = 0; i < spans.length; i++) {
    if (worded[w]?.i !== i) {
      times.push({ startMs: Math.round(last), endMs: Math.round(last) })
      continue
    }
    const k = w < B ? matched[w] : -1
    // Without a pause of its own, a sentence ends where its share of the speaking time does
    const endMs = w === B ? speechEnd : k >= 0 ? inner[k][0] : Math.max(clockAt(targets[w]), cursor + 1)
    times.push({ startMs: Math.round(cursor), endMs: Math.round(endMs) })
    last = endMs
    cursor = w === B ? speechEnd : k >= 0 ? inner[k][1] : endMs
    w++
  }
  return times
}

/** The nearest place around `estimate` where a voice would pause: after clause punctuation, else between words */
function breakNear(text: string, span: Span, estimate: number, floor: number) {
  const reach = Math.max(8, Math.round((span.end - span.start) * 0.12))
  const from = Math.max(floor, Math.round(estimate) - reach)
  const to = Math.min(span.end, Math.round(estimate) + reach)
  let space = -1
  let clause = -1
  for (let i = from; i <= to; i++) {
    if (!/\s/.test(text[i] ?? '')) continue
    if (space < 0 || Math.abs(i - estimate) < Math.abs(space - estimate)) space = i
    if (CLAUSE_BREAK.test(text[i - 1] ?? '') && (clause < 0 || Math.abs(i - estimate) < Math.abs(clause - estimate))) clause = i
  }
  const at = clause >= 0 ? clause : space >= 0 ? space : Math.round(estimate)
  return Math.min(Math.max(at, floor), span.end)
}

/**
 * The player's map from time to text: points in order of both character and
 * time, between which the highlight moves evenly. It runs through each
 * sentence while the voice is speaking and holds still through its pauses,
 * so it stays with the voice instead of drifting across a whole part.
 */
export function textAnchors(part: AlignInput): TextAnchor[] {
  const anchors: TextAnchor[] = []
  timedPieces(part).forEach((s) => {
    const { startMs, endMs } = s
    if (endMs <= startMs) return
    const inner = part.pauses.filter((p) => p[0] > startMs && p[1] < endMs)
    const spokenMs = Math.max(endMs - startMs - inner.reduce((n, p) => n + (p[1] - p[0]), 0), 1)
    anchors.push([s.start, startMs])
    let spoken = 0
    let at = startMs
    let floor = s.start
    for (const [from, to] of inner) {
      spoken += from - at
      at = to
      floor = breakNear(part.text, s, s.start + (spoken / spokenMs) * (s.end - s.start), floor)
      anchors.push([floor, from], [floor, to])
    }
    anchors.push([s.end, endMs])
  })
  return anchors
}
