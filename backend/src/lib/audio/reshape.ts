import { FRAME_MS, MFCC_DIMS, type Prosody } from './prosody.js'

/**
 * Says a recorded take the way someone else said the same words: their
 * timing, their stops, the tune of their voice and where they pressed on a
 * word, in the take's own voice.
 *
 * The two are lined up sound by sound (the outline of each sound is the same
 * whoever says it), which says where in the take each moment of the
 * performance is. The take is then put together again from its own pitch
 * periods, laid down at the performance's pace and pitch ("PSOLA"). Nothing
 * is taken from the performer's voice: the result is made only of the take's
 * sound, so it's the same speaker as the lines around it.
 */

/** Where the performed words lie in the take's speech, as shares of it: 0 to 1 when the take is those words and nothing else */
export interface Span {
  from: number
  to: number
}

/** A take lined up with a performance: where each moment of the performance is in the take, and how far the take has to be bent */
export interface Fit {
  /** For each frame of the result: the place in the take it's made from, in ms (−1 in a stop) */
  sourceMs: Float32Array
  /** The pitch the result has there in Hz; 0 leaves the take's own */
  pitchHz: Float32Array
  /** How much louder or quieter than the take it is there, in dB */
  gainDb: Float32Array
  /** The frames of the result that are the performance (the rest is the take as it was, before and after) */
  from: number
  to: number
  /** How unlike the two sound, sound for sound: about 3 for the same words, 4.5 and up for other words */
  mismatch: number
  /** How much the take's pace is changed, as octaves of speed on average (0 is none, 1 is double or half) */
  stretch: number
  /** How much its pitch is changed, in semitones on average */
  bend: number
}

// The take may run at half to double the performance's pace at any moment, no further: beyond that it stops sounding like speech
const SKEW_COST = 0.3
// How far from its expected place a performance of part of a take may start and end, as a share of those words' length in the take
const SEARCH_SHARE = 0.35
const SEARCH_MIN_FRAMES = 30
// The most pairs of frames compared at once (4 bytes each, and one more for the way back)
const MAX_CELLS = 4_000_000
// A take that is the performed words: it starts and ends within this of the take's own start and end
const EDGE_FRAMES = 15
// Where the words should be in the take is known roughly from the text. Starting or ending further from
// there than a tenth of a second costs this much a frame: without it, a drawn-out performance of three
// words was sometimes laid over five (it needed less stretching that way)
const PLACE_FREE_FRAMES = 10
const PLACE_COST = 1
// The pace found frame by frame jumps between half, same and double; it's evened out over about a syllable (twice over this many frames)
const PACE_SMOOTH = 9
// Loudness follows the performance over about a syllable, and by no more than this
const GAIN_SMOOTH = 15
const MAX_GAIN_DB = 6
// A performance with less voice in it than this (a whisper) has no tune to follow
const MIN_VOICED_SHARE = 0.25
// The pitch never moves further from the take's own than this, in semitones
const MAX_BEND = 9

const distance = (a: Float32Array, i: number, b: Float32Array, j: number) => {
  let sum = 0
  for (let c = 0; c < MFCC_DIMS; c++) {
    const d = a[i * MFCC_DIMS + c] - b[j * MFCC_DIMS + c]
    sum += d * d
  }
  return Math.sqrt(sum)
}

/** A running mean over `width` values (those that count), narrowing towards the ends so the ends themselves don't move */
const smoothed = (values: Float32Array, width: number, use: (i: number) => boolean) => {
  const out = Float32Array.from(values)
  for (let i = 0; i < values.length; i++) {
    if (!use(i)) continue
    const half = Math.min(Math.floor(width / 2), i, values.length - 1 - i)
    let sum = 0
    let count = 0
    for (let k = i - half; k <= i + half; k++) {
      if (!use(k)) continue
      sum += values[k]
      count++
    }
    out[i] = sum / count
  }
  return out
}

/**
 * Lines a take up with a performance of (some of) its words. Null when they
 * can't be: nothing spoken in one of them, or one more than twice as long as
 * the other.
 */
export function fit(take: Prosody, said: Prosody, span: Span = { from: 0, to: 1 }): Fit | null {
  const spoken = (p: Prosody) => Array.from({ length: p.frames }, (_, f) => f).filter((f) => p.speech[f])
  const allSaid = spoken(said)
  const allTake = spoken(take)
  if (allSaid.length < 8 || allTake.length < 8) return null
  // A long performance is lined up on every second or third frame, so the work fits in memory; the
  // places in between are filled in afterwards
  const every = Math.max(1, Math.ceil(Math.sqrt((allSaid.length * allTake.length) / MAX_CELLS)))
  const thinned = (frames: number[]) => (every === 1 ? frames : frames.filter((_, i) => i % every === 0))
  const U = thinned(allSaid)
  const T = thinned(allTake)
  const n = U.length
  const framesOf = (count: number) => Math.max(1, Math.round(count / every))

  // The stretch of the take's speech to look in
  const expectedFrom = Math.round(span.from * T.length)
  const expectedTo = Math.round(span.to * T.length)
  const reach = Math.max(framesOf(SEARCH_MIN_FRAMES), Math.round(SEARCH_SHARE * (expectedTo - expectedFrom)))
  const a = span.from <= 0.02 ? 0 : Math.max(0, expectedFrom - reach)
  const b = span.to >= 0.98 ? T.length : Math.min(T.length, expectedTo + reach)
  const m = b - a
  if (m < n / 2) return null
  const startWithin = span.from <= 0.02 ? Math.min(framesOf(EDGE_FRAMES), m - 1) : Math.min(2 * reach, m - 1)
  const endWithin = span.to >= 0.98 ? Math.min(framesOf(EDGE_FRAMES), m - 1) : Math.min(2 * reach, m - 1)

  const cost = new Float32Array(n * m).fill(Infinity)
  const step = new Uint8Array(n * m)
  // Frames are compared by their sound alone. Comparing how the sound is moving as well was tried and
  // placed a performance no better (10 of 20 within 0.1 s either way, Oct 2026)
  const d = (i: number, j: number) => distance(said.mfcc, U[i], take.mfcc, T[a + j])
  const misplaced = (frames: number) => PLACE_COST * every * Math.max(0, Math.abs(frames) - framesOf(PLACE_FREE_FRAMES))
  for (let j = 0; j <= startWithin; j++) cost[j] = d(0, j) + misplaced(a + j - expectedFrom)
  for (let i = 1; i < n; i++) {
    // Only the cells a path at half to double pace can reach
    const low = Math.max(0, Math.floor((i - 1) / 2) - 1)
    const high = Math.min(m - 1, startWithin + 2 * i)
    for (let j = low; j <= high; j++) {
      const here = d(i, j)
      let best = Infinity
      let how = 0
      if (j >= 1) {
        const straight = cost[(i - 1) * m + j - 1]
        if (straight < best) [best, how] = [straight, 0]
        // Two frames of the performance for one of the take: the take is slowed there
        if (i >= 2) {
          const slowed = cost[(i - 2) * m + j - 1] + d(i - 1, j) + SKEW_COST
          if (slowed < best) [best, how] = [slowed, 1]
        }
      }
      // One frame of the performance for two of the take: the take is hurried there
      if (j >= 2) {
        const hurried = cost[(i - 1) * m + j - 2] + d(i, j - 1) + SKEW_COST
        if (hurried < best) [best, how] = [hurried, 2]
      }
      if (best === Infinity) continue
      cost[i * m + j] = best + here
      step[i * m + j] = how
    }
  }
  let end = -1
  let total = Infinity
  for (let j = Math.max(0, m - 1 - endWithin); j < m; j++) {
    const here = cost[(n - 1) * m + j] + misplaced(a + j + 1 - expectedTo)
    if (here < total) [end, total] = [j, here]
  }
  if (end < 0 || total === Infinity) return null

  // Back along the path: the take frame (among its spoken ones) each performance frame falls on
  const found = new Float32Array(n)
  for (let i = n - 1, j = end; i >= 0; ) {
    const how = step[i * m + j]
    found[i] = a + j
    if (how === 1) {
      found[i - 1] = a + j
      i -= 2
      j -= 1
    } else if (how === 2) {
      found[i] = a + j - 0.5
      i -= 1
      j -= 2
    } else {
      i -= 1
      j -= 1
    }
  }
  const mismatch = cost[(n - 1) * m + end] / n
  // From here on, every spoken frame of both again
  const at = new Float32Array(allSaid.length)
  for (let i = 0; i < at.length; i++) {
    const place = Math.min(n - 1, i / every)
    const low = Math.floor(place)
    const high = Math.min(n - 1, low + 1)
    at[i] = Math.min(allTake.length - 1, (found[low] + (found[high] - found[low]) * (place - low)) * every)
  }
  const even = smoothed(smoothed(at, PACE_SMOOTH, () => true), PACE_SMOOTH, () => true)
  for (let i = 1; i < at.length; i++) even[i] = Math.max(even[i], even[i - 1])
  /** A place among the take's spoken frames as a time in the take */
  const takeMs = (place: number) => {
    const low = Math.max(0, Math.min(allTake.length - 1, Math.floor(place)))
    const high = Math.min(allTake.length - 1, low + 1)
    // Across a stop in the take the next spoken frame is far away: the place stays on this side of it
    const next = allTake[high] - allTake[low] === 1 ? allTake[high] : allTake[low] + 1
    return (allTake[low] + (next - allTake[low]) * (place - low)) * FRAME_MS
  }

  // The result: the take up to where the performance starts, the performance's own length, and the rest of the take
  const all = allSaid.length
  const before = Math.round(takeMs(even[0]) / FRAME_MS)
  const after = Math.min(take.frames, Math.round(takeMs(even[all - 1]) / FRAME_MS) + 1)
  const length = allSaid[all - 1] - allSaid[0] + 1
  const frames = before + length + (take.frames - after)
  const sourceMs = new Float32Array(frames).fill(-1)
  const pitchHz = new Float32Array(frames)
  const gainDb = new Float32Array(frames)
  for (let f = 0; f < before; f++) sourceMs[f] = f * FRAME_MS
  for (let f = 0; f < take.frames - after; f++) sourceMs[before + length + f] = (after + f) * FRAME_MS

  // The tune: how far from their usual pitch the performer is at each moment, carried across the sounds that have no pitch
  const tune = new Float32Array(said.frames).fill(NaN)
  let voiced = 0
  for (const f of allSaid) {
    if (!said.f0[f] || !said.medianHz) continue
    tune[f] = 12 * Math.log2(said.f0[f] / said.medianHz)
    voiced++
  }
  const sings = voiced / all >= MIN_VOICED_SHARE && take.medianHz > 0
  if (sings) {
    let last = -1
    for (let f = allSaid[0]; f <= allSaid[all - 1]; f++) {
      if (Number.isNaN(tune[f])) continue
      if (last < 0) tune.fill(tune[f], allSaid[0], f)
      else for (let k = last + 1; k < f; k++) tune[k] = tune[last] + ((tune[f] - tune[last]) * (k - last)) / (f - last)
      last = f
    }
    if (last >= 0) tune.fill(tune[last], last + 1, allSaid[all - 1] + 1)
  }

  let stretch = 0
  let bend = 0
  let bent = 0
  const loud = new Float32Array(length)
  allSaid.forEach((frame, i) => {
    const f = before + frame - allSaid[0]
    sourceMs[f] = takeMs(even[i])
    const source = Math.min(take.frames - 1, Math.round(sourceMs[f] / FRAME_MS))
    if (sings) {
      const st = Math.max(-MAX_BEND, Math.min(MAX_BEND, tune[frame]))
      pitchHz[f] = take.medianHz * 2 ** (st / 12)
      if (take.f0[source]) {
        bend += Math.abs(12 * Math.log2(pitchHz[f] / take.f0[source]))
        bent++
      }
    }
    loud[frame - allSaid[0]] = said.energy[frame] - said.levelDb - (take.energy[source] - take.levelDb)
    if (i > 0 && frame - allSaid[i - 1] === 1) stretch += Math.abs(Math.log2(Math.max((even[i] - even[i - 1]) || 0.25, 0.25)))
  })
  // Where the performer stops, the take's own stop is heard for as long as it lasts (the end of its last
  // sound, its breath), then silence: a line cut off dead at each stop sounds edited
  for (let k = 1; k < length; k++) {
    const f = before + k
    if (sourceMs[f] >= 0 || sourceMs[f - 1] < 0) continue
    const quiet = Math.round(sourceMs[f - 1] / FRAME_MS) + 1
    if (quiet < take.frames && !take.speech[quiet]) sourceMs[f] = quiet * FRAME_MS
  }
  const isSpoken = (k: number) => !!said.speech[allSaid[0] + k]
  const evenLoud = smoothed(loud, GAIN_SMOOTH, isSpoken)
  for (let k = 0; k < length; k++) if (isSpoken(k)) gainDb[before + k] = Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, evenLoud[k]))

  return { sourceMs, pitchHz, gainDb, from: before, to: before + length, mismatch, stretch: stretch / all, bend: bent ? bend / bent : 0 }
}

/** Where a voice's pitch periods are in a clip: one mark a period while it's voiced, one every 5 ms otherwise */
interface Marks {
  at: Int32Array
  period: Float32Array
  voiced: Uint8Array
}

const UNVOICED_STEP_MS = 5

function pitchMarks(samples: Float32Array, sampleRate: number, take: Prosody): Marks {
  const hop = (sampleRate * FRAME_MS) / 1000
  const step = Math.round((sampleRate * UNVOICED_STEP_MS) / 1000)
  // Each period has one tall peak, up or down by the microphone's wiring: marks sit on the taller side
  let up = 0
  let down = 0
  for (let f = 0; f < take.frames; f++) {
    if (!take.f0[f]) continue
    let high = 0
    let low = 0
    for (let i = Math.round(f * hop), end = Math.min(samples.length, i + Math.round(hop)); i < end; i++) {
      high = Math.max(high, samples[i])
      low = Math.min(low, samples[i])
    }
    up += high
    down -= low
  }
  const sign = up >= down ? 1 : -1
  const at: number[] = []
  const period: number[] = []
  const voiced: number[] = []
  const peak = (from: number, to: number) => {
    let best = Math.max(0, Math.round(from))
    for (let i = best, end = Math.min(samples.length - 1, Math.round(to)); i <= end; i++) if (sign * samples[i] > sign * samples[best]) best = i
    return best
  }
  let t = 0
  let running = false
  while (t < samples.length) {
    const f = Math.min(take.frames - 1, Math.floor(t / hop))
    const hz = take.f0[f]
    if (hz) {
      const T = sampleRate / hz
      // In a voiced stretch the next peak is one period on; at its start, the tallest peak of the first period
      let mark = running ? peak(t - 0.3 * T, t + 0.3 * T) : peak(t, t + T)
      if (at.length && mark <= at[at.length - 1]) mark = at[at.length - 1] + Math.max(1, Math.round(T / 2))
      at.push(mark)
      period.push(T)
      voiced.push(1)
      t = mark + T
      running = true
    } else {
      const mark = Math.max(Math.round(t), at.length ? at[at.length - 1] + 1 : 0)
      at.push(mark)
      period.push(step)
      voiced.push(0)
      t = mark + step
      running = false
    }
  }
  return { at: Int32Array.from(at), period: Float32Array.from(period), voiced: Uint8Array.from(voiced) }
}

// The pitch asked for is read this far ahead: laid down from the pitch at the same moment, the result's
// tune ran about a frame late (measured on four clips given their own tune back, Oct 2026)
const PITCH_AHEAD_MS = 12
// How far the laid-down pitch may be from the take's own at one mark (as a ratio of periods)
const MIN_PERIOD_RATIO = 1 / 1.8
const MAX_PERIOD_RATIO = 1 / 0.55

/** The take said the way the fit says: its pitch periods laid down again at the performance's pace, pitch and loudness */
export function reshape(samples: Float32Array, sampleRate: number, take: Prosody, plan: Fit): Float32Array {
  const hop = (sampleRate * FRAME_MS) / 1000
  const marks = pitchMarks(samples, sampleRate, take)
  const count = marks.at.length
  const frames = plan.sourceMs.length
  const out = new Float32Array(Math.ceil(frames * hop) + sampleRate / 10)
  if (!count) return out.subarray(0, Math.ceil(frames * hop))

  const nearest = (position: number) => {
    let low = 0
    let high = count - 1
    while (low < high) {
      const mid = (low + high) >> 1
      if (marks.at[mid] < position) low = mid + 1
      else high = mid
    }
    return low > 0 && position - marks.at[low - 1] < marks.at[low] - position ? low - 1 : low
  }
  let previous = -1
  let t = 0
  // After the start and after every stop, the first period is laid exactly where the take's own falls,
  // so wherever nothing is changed the result is the take, sample for sample
  let resuming = true
  const ahead = (sampleRate * PITCH_AHEAD_MS) / 1000
  while (t < frames * hop) {
    const frame = Math.min(frames - 1, Math.floor(t / hop))
    if (plan.sourceMs[frame] < 0) {
      t = (frame + 1) * hop
      resuming = true
      continue
    }
    // Between two frames of the result, the place in the take moves at the pace found there
    const next = frame + 1 < frames && plan.sourceMs[frame + 1] >= 0 ? plan.sourceMs[frame + 1] : plan.sourceMs[frame] + FRAME_MS
    const pace = Math.max((next - plan.sourceMs[frame]) / FRAME_MS, 0.25)
    const source = ((plan.sourceMs[frame] + pace * FRAME_MS * ((t - frame * hop) / hop)) * sampleRate) / 1000
    let k = nearest(source)
    if (resuming) {
      resuming = false
      // Never back into the stop it came out of: the mark at or after this moment
      if (marks.at[k] < source && k + 1 < count) k++
      const onMark = t + (marks.at[k] - source) / pace
      if (onMark - t <= 2 * marks.period[k] && Math.floor(onMark / hop) < frames && plan.sourceMs[Math.floor(onMark / hop)] >= 0) t = onMark
    }
    const P = marks.period[k]
    // Left as it is, the next period starts where the take's own does; given a pitch, one period of that pitch on
    let spacing = k + 1 < count ? marks.at[k + 1] - marks.at[k] : P
    const pitch = plan.pitchHz[Math.min(frames - 1, Math.floor((t + ahead) / hop))] || plan.pitchHz[frame]
    if (marks.voiced[k] && pitch) spacing = Math.max(P * MIN_PERIOD_RATIO, Math.min(P * MAX_PERIOD_RATIO, sampleRate / pitch))
    // One period of the take, from the mark before to the mark after, faded at both ends
    const left = Math.max(1, Math.round(k > 0 ? marks.at[k] - marks.at[k - 1] : P))
    const right = Math.max(1, Math.round(k + 1 < count ? marks.at[k + 1] - marks.at[k] : P))
    // Periods laid closer together add up louder, further apart quieter
    const gain = 10 ** (plan.gainDb[frame] / 20) * (marks.voiced[k] ? spacing / P : 1)
    // A hiss or breath that's stretched repeats its grain; played backwards every other time it doesn't ring
    const backwards = !marks.voiced[k] && k === previous
    const centre = Math.round(t)
    for (let i = -left; i < right; i++) {
      const from = marks.at[k] + (backwards ? -i : i)
      const to = centre + i
      if (from < 0 || from >= samples.length || to < 0 || to >= out.length) continue
      const fade = i < 0 ? 0.5 * (1 + Math.cos((Math.PI * i) / left)) : 0.5 * (1 + Math.cos((Math.PI * i) / right))
      out[to] += samples[from] * fade * gain
    }
    previous = k
    t += spacing
  }
  return out.subarray(0, Math.ceil(frames * hop))
}
