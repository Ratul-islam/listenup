import { createHash } from 'node:crypto'
import { isAdjusted, type VoiceAdjust } from '../../lib/audio/adjust.js'
import { env } from '../../config/env.js'
import { EMOTIONS, SOUNDS, wordsKey, type ChunkExpressions, type EmotionId, type EmotionMark, type SoundMark, type SpeakerMark } from '../expressions/expression-catalog.js'
import { inLatinLetters, typedInLatin } from '../ingestion/text/language.js'
import { EMPTY_LEXICON, lexiconForLanguage, pronounce, type Lexicon } from '../pronunciations/lexicon.js'
import type { PartDelivery } from '../studio/studio-catalog.js'
import { castVoice } from '../voices/cast.js'
import { soundOf, type VoiceDefinition } from '../voices/voice-catalog.js'
import type { Delivery, DeliveryCheck, ShapeUse, SpeechSegment } from './providers/tts-provider.js'

/** What to voice for a chunk, and how. Its own delivery is the whole chunk's, when it's read one way. */
export interface RenderPlan extends Delivery {
  /** Changes whenever the audio would; cached clips with another key are stale */
  key: string
  /** Chunk text with inline sound tags */
  input: string
  /** "New take" count; above 0 the same words are recorded afresh */
  take: number
  /** Set when lines of the chunk are said differently: each run is voiced on its own, and they're joined */
  segments?: SpeechSegment[]
  /** The script's pace and pitch (Studio), for every take */
  adjust?: VoiceAdjust
  /** The voice that reads it: the one asked for, on the model this text is read with */
  voice: VoiceDefinition
}

interface Span {
  start: number
  end: number
  paragraphStart?: boolean
}

export interface RenderOptions {
  /** The listener's pronunciations ("Ratul" → "Rah-tool") */
  lexicon?: Lexicon
  take?: number
  /** The chunk's sentences, as offsets in its written text; found from the text when left out */
  sentences?: Span[]
  /** The script's voice settings (Studio): a tone for the narrator, and a pace and pitch for all of it */
  delivery?: PartDelivery
}

// Bump to regenerate every cached clip (e.g. after rewording styles)
const RENDER_VERSION = 1
// Bump to regenerate only the clips made of several takes (after changing how takes are levelled or joined)
const JOIN_VERSION = 2

const HAS_WORD = /[\p{L}\p{N}]/u
const wordCount = (text: string) => text.split(/\s+/).filter((w) => HAS_WORD.test(w)).length

// Fewer words than this left over beside a marked phrase are said with it, not voiced alone
const MIN_ALONE_WORDS = 2
// A run shorter than this joins a neighbour in the same mood: very short takes sound cut off
// from the rest, and a part voiced as many small takes stops sounding like one reader
const MIN_RUN_WORDS = 4
const MAX_RUNS = 6
// Where characters speak, their lines are takes already. A stretch of narration between them gets at
// most this many moods (and only ones the listener set), and a part at most this many takes in all
// (they're voiced a few at a time, so more means a longer wait)
const MAX_RUNS_PER_VOICE = 2
const MAX_TAKES = 12
// Where a voice breaks inside a sentence anyway: only there may a line be cut in two
const BREAK_BEFORE = /[,;:—–…"“‘«(।]$/u
const OPENS_QUOTE = /^["“‘«(]/u
const BREAK_AFTER = /[,;:!?.…—–"”’»)।]$/u
const BREAK_NEXT = /^\s*[,;:—–]/u
// Punctuation that belongs to the words beside it: a mark takes its quote marks and its comma along
const OPENER = /["“‘«(]/u
const CLOSER = /[,;:!?.…"”’»)।]/u

// The direction for text typed in English letters, in place of the voice's usual accent direction.
// It comes first and names the speaker and the accent: a short take with English words in it was
// otherwise read by an American-sounding voice about half the time (an audio model judged 10 short
// takes for each wording, Oct 2026: Bangla accent in 4 with the old wording at the end, in 8 with this one first).
const TYPED_AS: Partial<Record<string, string>> = {
  bn: 'spoken by a Bangladeshi speaker in natural Bangla with a Bangladeshi accent on every word (the words are Bangla typed in English letters; the English words mixed in are said the way Bangladeshis say them)',
  hi: 'spoken by an Indian speaker in natural Hindi with a Hindi accent on every word (the words are Hindi typed in English letters; the English words mixed in are said the way Hindi speakers say them)',
}

// Sounds the AI put in narration that a narrator still makes where characters speak: the others
// (a laugh, a gasp) are a character's, and came out as the narrator laughing before "she said, laughing"
const NARRATOR_SOUNDS = new Set<SoundMark['sound']>(['pause', 'long-pause', 'breath'])

// Between two words with nothing but a space between them (a take of words the listener performed, cut
// from the middle of a sentence), the clips' own ends are stop enough
const GAP_WORD_MS = 0
// Silence between runs, on top of the little each clip keeps at its ends (about 0.2 s). Inside one take
// these voices stop about 0.55 s at a full stop and 0.3 s at a comma (250 takes, Oct 2026). Joins were
// 0.34 s and 0.2 s, shorter than the voice's own stops, so the next line sounded rushed in.
const GAP_CLAUSE_MS = 180
const GAP_SENTENCE_MS = 360
const GAP_PARAGRAPH_MS = 560

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })

/** Sentences of text that came without them (a voice note's few lines) */
function sentencesOf(text: string): Span[] {
  const spans: Span[] = []
  for (const { segment, index } of segmenter.segment(text)) {
    const lead = segment.length - segment.trimStart().length
    const body = segment.trim()
    if (body) spans.push({ start: index + lead, end: index + lead + body.length })
  }
  return spans.length ? spans : [{ start: 0, end: text.length }]
}

/**
 * Deliveries that can be measured in the audio, so a take that missed one is made again (see
 * speakChecked). A voice follows a direction in about half its takes; when it does, a whisper has
 * almost no voice in it, an angry or shouted line comes back louder and a sad or frightened one
 * slower. Keeping the louder (or slower) of two takes got angry from 50% to 78% and frightened from
 * 46% to 73% of takes an audio model heard that way (72 takes, Oct 2026).
 *
 * `says` is what a direction of the listener's own has to say for the measure to hold: a direction
 * replaces the emotion's wording ("with an unsettling gentle smile" on a whisper), and takes made
 * again for a whisper nobody asked for kept the one with the least voice in it.
 */
const MEASURED: Partial<Record<EmotionId, { check: DeliveryCheck; says: RegExp }>> = {
  whisper: { check: 'whisper', says: /whisper/i },
  shout: { check: 'loud', says: /shout|scream|yell|roar|loud/i },
  angry: { check: 'loud', says: /shout|scream|yell|roar|loud|furious|rage/i },
  sad: { check: 'slow', says: /slow|heavy|tear|grief|sob|weep/i },
  scared: { check: 'slow', says: /slow|trembl|hesita/i },
}
// Words in a direction that ask for the opposite of what's measured ("quiet and controlled anger")
const QUIET = /quiet|soft|low|hush|calm|cold|controlled|restrain|murmur|mutter|under/i
const QUICK = /fast|quick|rapid|hurr|rush|brisk|frantic|panic|breathless|urgent/i

function checkOf(m: EmotionMark | null): DeliveryCheck | undefined {
  const measured = m && MEASURED[m.emotion]
  if (!measured) return undefined
  // Strong fear is worded "terrified, breathless and shaking", which isn't slow
  if (!m.direction) return m.strong && m.emotion === 'scared' ? undefined : measured.check
  if (!measured.says.test(m.direction)) return undefined
  return (measured.check === 'loud' && QUIET.test(m.direction)) || (measured.check === 'slow' && QUICK.test(m.direction)) ? undefined : measured.check
}

// A feeling the listener set themselves gets three takes at most, one the AI suggested two: there
// are many more of those, and each extra take is our cost. A whisper keeps three: it misses most.
const triesOf = (m: EmotionMark, check: DeliveryCheck) => (check === 'whisper' || !m.ai ? 3 : 2)

// Every take is brought to one level (see levelPcm), which also flattened what should stand out:
// a shout came back no louder than the narration around it. These stay above or below it, in dB.
const LEVEL_DB: Partial<Record<EmotionId, number>> = { whisper: -5, shout: 3, angry: 2 }

/**
 * Ways of speaking the voice has a tag for. The tag goes in front of the words as well as into the
 * direction: on 16 takes each (Oct 2026, by voiced share), a whisper came out whispered in 8 with
 * the direction alone, in 12 with the tag alone and in 13 with both.
 */
const DELIVERY_TAG: Partial<Record<EmotionId, string>> = { whisper: '<whispering>', shout: '<shout>' }
const tagOf = (m: EmotionMark | null) => (m && DELIVERY_TAG[m.emotion] && checkOf(m) ? DELIVERY_TAG[m.emotion] : undefined)
const tagged = (words: string, m: EmotionMark | null) => (tagOf(m) ? `${tagOf(m)} ${words}` : words)

// What a voice can't be bent into: the sound of the voice itself, not its timing or its tune
const VOICE_QUALITY = /whisper|shout|scream|yell|raised voice|sob|cry|tear|weep|laugh|giggl|chuckl|trembl|shak|quiver|gasp|breath/i

/**
 * A line the listener performed whose feeling is in its timing and tune (calm, serious, happy…).
 * Its performance carries all of that, so it's said in the reader's own manner, with the sentence
 * after it: voiced alone, two words ("Door khullo.", Nusrat, 6 tries each, Oct 2026) came back in
 * the narrator's own voice in 2 of 6 and as other words ("Dorja khullo") in 5; voiced with the next
 * sentence and shaped the same way, 5 of 6 and none. A whisper, a shout, tears or a laugh still
 * need the direction, so they keep their own take.
 */
const performedPlainly = (m: EmotionMark | null) => !!m?.shape && !VOICE_QUALITY.test(m.direction ?? (m.strong ? EMOTIONS[m.emotion].strongStyle : EMOTIONS[m.emotion].style))

/** How a marked run is said, as a standalone direction */
const styleOf = (m: EmotionMark) =>
  // Some directions come back already starting "spoken …"
  m.direction ? `spoken ${m.direction.replace(/^(spoken|said)\s+/i, '')}` : m.strong ? EMOTIONS[m.emotion].strongStyle : EMOTIONS[m.emotion].style

/**
 * A mark's reach as it's voiced: whole sentences, or a clause when the mark
 * starts or ends where the voice breaks anyway (a quoted line inside
 * narration). Cutting a sentence anywhere else makes the join audible.
 */
function widen(text: string, sentences: Span[], mark: { start: number; end: number }) {
  const first = sentences.find((s) => mark.start < s.end) ?? sentences[sentences.length - 1]
  let last = first
  for (const s of sentences) if (mark.end > s.start) last = s
  let { start, end } = mark
  while (start > first.start && OPENER.test(text[start - 1])) start--
  while (end < last.end && CLOSER.test(text[end])) end++
  const before = text.slice(first.start, start)
  if (wordCount(before) < MIN_ALONE_WORDS || !(BREAK_BEFORE.test(before.trimEnd()) || OPENS_QUOTE.test(text.slice(start).trimStart()))) {
    start = Math.min(first.start, start)
  }
  const after = text.slice(end, last.end)
  if (wordCount(after) < MIN_ALONE_WORDS || !(BREAK_AFTER.test(text.slice(start, end).trimEnd()) || BREAK_NEXT.test(after))) {
    end = Math.max(last.end, end)
  }
  return { start, end }
}

/** A mark's words with the quote marks and punctuation that belong to them, and nothing else */
function hugged(text: string, mark: { start: number; end: number }, range: Span) {
  let { start, end } = mark
  while (start > range.start && OPENER.test(text[start - 1])) start--
  while (end < range.end && CLOSER.test(text[end])) end++
  return { start, end }
}

interface Run {
  start: number
  end: number
  mark: EmotionMark | null
}

/** Who reads a stretch: a character's voice and how they always sound, or null for the narrator */
interface Reader {
  voice: VoiceDefinition | null
  manner?: string
}

/** A run and who reads it */
interface Take extends Run, Reader {}

/**
 * A stretch of the chunk (all of it, or what one voice reads) as runs said one
 * way each: marked lines, and the plain reading between them
 */
function runsOf(
  text: string,
  allSentences: Span[],
  allEmotions: EmotionMark[],
  deliveryOf: (mark: EmotionMark | null) => string | undefined,
  range: Span,
  maxRuns: number,
): Run[] {
  // Only what lies inside the stretch counts; a sentence cut by its edge no longer opens a paragraph
  const within = <T extends Span>(span: T): T => ({ ...span, start: Math.max(span.start, range.start), end: Math.min(span.end, range.end) })
  const sentences = allSentences.map((s) => ({ ...within(s), paragraphStart: s.paragraphStart && s.start >= range.start })).filter((s) => s.end > s.start)
  const emotions = allEmotions.map(within).filter((m) => m.end > m.start)
  if (!sentences.length) return [{ start: range.start, end: range.end, mark: null }]

  const runs: Run[] = []
  let cursor = range.start
  /** Performed words said plainly, with the rest of their sentence and the sentence after (or before), when no other feeling is on it */
  const withContext = (mark: EmotionMark): Span | null => {
    const first = sentences.findIndex((s) => mark.start < s.end)
    if (first < 0) return null
    let last = first
    while (last + 1 < sentences.length && mark.end > sentences[last + 1].start) last++
    const free = (i: number) => !!sentences[i] && !emotions.some((m) => m !== mark && m.end > sentences[i].start && m.start < sentences[i].end)
    const from = !free(last + 1) && free(first - 1) ? first - 1 : first
    const to = free(last + 1) ? last + 1 : last
    return { start: Math.min(sentences[from].start, mark.start), end: Math.max(sentences[to].end, mark.end) }
  }
  for (const mark of emotions) {
    // Words the listener performed with a whisper, a shout or tears in them are a take of their own, exactly
    // those words (and the quote marks and comma that hug them): a take can be lined up with a performance of
    // all of it dependably, and of a few words somewhere inside it only about three times in four (20 tries,
    // Oct 2026). Performed plainly, they go with the words around them (see performedPlainly); of three takes
    // made, one lined up nearly always does
    const reach = mark.shape ? ((performedPlainly(mark) && withContext(mark)) || hugged(text, mark, range)) : widen(text, sentences, mark)
    // A mark widened over the one before it keeps only what's left
    const start = Math.max(reach.start, cursor)
    if (reach.end <= start) continue
    if (start > cursor) runs.push({ start: cursor, end: start, mark: null })
    runs.push({ start, end: reach.end, mark })
    cursor = reach.end
  }
  if (cursor < range.end) runs.push({ start: cursor, end: range.end, mark: null })

  const words = (run: Run) => wordCount(text.slice(run.start, run.end))
  /** Joins neighbours said the same way (and stray spaces or punctuation to the run before) into one request */
  const tidy = (list: Run[]) => {
    const out: Run[] = []
    for (const run of list) {
      const previous = out[out.length - 1]
      // A performed run keeps to its own words and context: the takes made of it to fit the performance are ours to pay for
      const performed = !!previous?.mark?.shape || !!run.mark?.shape
      if (previous && (!words(run) || (!performed && deliveryOf(previous.mark) === deliveryOf(run.mark)))) previous.end = run.end
      else out.push({ ...run })
    }
    // A wordless opening (a quote mark, a dash) goes with the first words
    if (out.length > 1 && !words(out[0])) {
      out[1].start = out[0].start
      out.shift()
    }
    return out
  }
  /** Run `i` becomes part of the run beside it; the longer of the two decides how both are said (a performed one always does) */
  const absorb = (list: Run[], i: number, into: number) => {
    const [a, b] = i < into ? [list[i], list[into]] : [list[into], list[i]]
    const keeps = list[i].mark?.shape ? list[i] : list[into].mark?.shape || words(list[into]) >= words(list[i]) ? list[into] : list[i]
    const joined = { start: a.start, end: b.end, mark: keeps.mark }
    return tidy([...list.slice(0, Math.min(i, into)), joined, ...list.slice(Math.max(i, into) + 1)])
  }

  /** The run starts a paragraph, so it belongs with what follows it */
  const opensParagraph = (run: Run) => {
    const from = run.start + (text.slice(run.start, run.end).length - text.slice(run.start, run.end).trimStart().length)
    return sentences.some((s) => s.paragraphStart && s.start === from)
  }

  let merged = tidy(runs)
  // Short runs: into a neighbour in the same mood. A few plain words between marked lines go with
  // the line they belong to: the one before ("…," she said), or the one after when they open a paragraph (Tom laughed. "…")
  for (let i = 0; i < merged.length; ) {
    const run = merged[i]
    const sameMood = (other: Run | undefined) => !!other?.mark && !!run.mark && other.mark.emotion === run.mark.emotion
    const before = merged[i - 1] ? i - 1 : -1
    const after = merged[i + 1] ? i + 1 : -1
    const plainInto = opensParagraph(run) && after >= 0 ? after : before >= 0 ? before : after
    // A performed run stands alone however short, and a few plain words beside one stay plain: said with it,
    // they'd be words the performance has nothing for
    const beside = (k: number) => (k >= 0 && merged[k].mark?.shape ? -1 : k)
    const into = words(run) >= MIN_RUN_WORDS || run.mark?.shape ? -1 : sameMood(merged[i - 1]) ? beside(before) : sameMood(merged[i + 1]) ? beside(after) : run.mark ? -1 : beside(plainInto) >= 0 ? plainInto : beside(plainInto === before ? after : before)
    if (into < 0) {
      i++
      continue
    }
    merged = absorb(merged, i, into)
    i = 0
  }
  // Still many: the shortest joins its shorter neighbour until they fit (performed runs last of all)
  while (merged.length > maxRuns) {
    const size = (run: Run) => words(run) + (run.mark?.shape ? 1e6 : 0)
    let i = 0
    merged.forEach((run, k) => {
      if (size(run) < size(merged[i])) i = k
    })
    const into = !merged[i - 1] ? i + 1 : !merged[i + 1] ? i - 1 : words(merged[i - 1]) <= words(merged[i + 1]) ? i - 1 : i + 1
    merged = absorb(merged, i, into)
  }
  return merged
}

/**
 * The chunk as stretches read by one voice each: the narrator (null), and
 * each character for the words they say. Spaces and stray punctuation between
 * two stretches go with the one before.
 */
function castSpans(text: string, speakers: SpeakerMark[], narrator: VoiceDefinition): (Span & Reader)[] {
  const lines = speakers
    .filter((m) => m.end > m.start)
    .sort((a, b) => a.start - b.start)
    .map((m) => ({ start: m.start, end: m.end, voice: castVoice(m, narrator), manner: m.manner }))
    // Nobody else to give them: the narrator reads their lines, as part of the narration
    .filter((l) => l.voice.providerVoice !== narrator.providerVoice || l.voice.model !== narrator.model)
  const spans: (Span & Reader)[] = []
  const add = (start: number, end: number, voice: VoiceDefinition | null, manner?: string) => {
    if (end <= start) return
    const previous = spans[spans.length - 1]
    // Two characters who share a voice are still two takes, each in their own manner
    if (previous && (!HAS_WORD.test(text.slice(start, end)) || (previous.voice?.id === voice?.id && previous.manner === manner))) previous.end = end
    else spans.push({ start, end, voice, ...(manner && { manner }) })
  }
  let cursor = 0
  for (const line of lines) {
    add(cursor, line.start, null)
    add(Math.max(line.start, cursor), line.end, line.voice, line.manner)
    cursor = Math.max(line.end, cursor)
  }
  add(cursor, text.length, null)
  // A wordless opening goes with the first words
  if (spans.length > 1 && !HAS_WORD.test(text.slice(spans[0].start, spans[0].end))) {
    spans[1].start = spans[0].start
    spans.shift()
  }
  return spans
}

/**
 * Everything that's voiced on its own. Read by one voice, a part is split
 * where its mood changes.
 *
 * Where characters speak, the voices are the performance, and every take is
 * one voice saying one stretch one way: each new direction makes the voice
 * sound like someone else. Measured Oct 2026 on about 100 short takes of two
 * voices: lines each given their own direction were the furthest apart in
 * timbre from one another, and lines all given one fixed direction the
 * closest (closer than with none). So a character says every line in their
 * one manner (see deliveryOf), and the narrator keeps one storytelling voice
 * through the part. The AI's feelings don't change either: its labels aren't
 * to be taken at their word (it marked seven soft-spoken lines of one short
 * story "whisper"). A feeling the listener set themselves is always followed,
 * on a character's line or on narration. A feeling put on `she said, "…"` is
 * for the spoken words, not the narrator's half of the sentence.
 */
function takesOf(
  text: string,
  sentences: Span[],
  emotions: EmotionMark[],
  spans: (Span & Reader)[],
  deliveryOf: (mark: EmotionMark | null, reader: Reader) => string | undefined,
): Take[] {
  const oneVoice = spans.length <= 1
  const overlaps = (a: Span, b: Span) => a.end > b.start && a.start < b.end
  const lines = spans.filter((span) => span.voice)
  /** The feeling the listener put on a character's line, if any: one that covers at least half its words */
  const moodOf = (span: Span): EmotionMark | null => {
    let mood: EmotionMark | null = null
    let most = 0
    for (const m of emotions) {
      if (m.ai || !overlaps(m, span)) continue
      const covered = wordCount(text.slice(Math.max(m.start, span.start), Math.min(m.end, span.end)))
      if (covered > most) [mood, most] = [m, covered]
    }
    return most * 2 >= wordCount(text.slice(span.start, span.end)) ? mood : null
  }
  const takes = spans.flatMap((span): Take[] => {
    const reader: Reader = { voice: span.voice, ...(span.manner && { manner: span.manner }) }
    if (!oneVoice && span.voice) return [{ start: span.start, end: span.end, mark: moodOf(span), ...reader }]
    const inside = emotions.filter((m) => overlaps(m, span) && (oneVoice || (!m.ai && !lines.some((line) => overlaps(m, line)))))
    const runs = inside.length ? runsOf(text, sentences, inside, (mark) => deliveryOf(mark, reader), span, oneVoice ? MAX_RUNS : MAX_RUNS_PER_VOICE) : [{ start: span.start, end: span.end, mark: null }]
    return runs.map((run) => ({ ...run, ...reader }))
  })
  // Quick-fire dialogue: the shortest take joins the one before it, in that one's voice, until the part is short enough to wait for
  const words = (take: Take) => wordCount(text.slice(take.start, take.end))
  while (takes.length > MAX_TAKES) {
    let i = 1
    takes.forEach((take, k) => {
      if (k > 0 && words(take) < words(takes[i])) i = k
    })
    takes[i - 1].end = takes[i].end
    takes.splice(i, 1)
  }
  return takes
}

/** Text with its sound tags in front of the words they're attached to */
function withSounds(text: string, sounds: SoundMark[], start: number, end: number, toEnd: boolean) {
  let cursor = start
  let out = ''
  for (const s of sounds) {
    if (s.at < start || (toEnd ? s.at > end : s.at >= end)) continue
    out += `${text.slice(cursor, s.at)}${SOUNDS[s.sound]} `
    cursor = s.at
  }
  return (out + text.slice(cursor, end)).replace(/ {2,}/g, ' ').trim()
}

/**
 * Decides how a chunk is voiced. Text read one way throughout (plain, in the
 * document's narration style, or one emotion over all of it) is one request
 * with that style.
 *
 * When some lines have their own emotion, every run is its own request with
 * its own short style, and the runs are joined. Measured in Oct 2026 on Gemini
 * TTS: a style reliably changes a short passage it covers, but one request
 * told that only some quoted words are whispered either ignores it or whispers
 * the whole paragraph. Google's guidance is the same: keep styles short, and
 * split the text where the delivery changes.
 *
 * Sounds are inline audio tags. Voices that can't take emotions read the plain text.
 */
export function planRender(
  written: string,
  marks: ChunkExpressions,
  voice: VoiceDefinition,
  narration?: string | null,
  { lexicon = EMPTY_LEXICON, take = 0, sentences: given, delivery: settings }: RenderOptions = {},
): RenderPlan {
  // Pronunciations change the words; emotions, sounds and sentences move with them
  const spoken = pronounce(written, lexiconForLanguage(lexicon, voice.language))
  const text = spoken.text
  let input = text
  let segments: SpeechSegment[] | undefined

  const move = <T extends { start: number; end: number }>(span: T): T => ({ ...span, start: spoken.map(span.start), end: spoken.map(span.end, 'end') })
  const sentences = given?.length ? given.map(move).filter((s) => s.end > s.start) : sentencesOf(text)
  // Emotions and sounds need a voice that can act; characters' own voices work on any voice the server makes.
  // A performance only belongs to the words it was said for: after an edit to them it's left out.
  const performed = (m: EmotionMark): EmotionMark => {
    if (!m.shape || m.shape.of === wordsKey(written.slice(m.start, m.end))) return m
    const { shape: _other, ...plain } = m
    return plain
  }
  const emotions = voice.expressive ? marks.emotions.map(performed).map(move).filter((m) => m.end > m.start).sort((a, b) => a.start - b.start) : []
  const letters = (from: number, to: number) => text.slice(from, to).match(/[\p{L}\p{N}]/gu)?.length ?? 0
  /** The listener's performance of words inside a stretch, and where in the stretch those words are */
  const shapeIn = (start: number, end: number): ShapeUse | undefined => {
    const mark = emotions.find((m) => m.shape && m.start >= start && m.end <= end)
    const all = letters(start, end)
    if (!mark?.shape || !all) return undefined
    const share = (to: number) => Math.round((letters(start, to) / all) * 1000) / 1000
    return { id: mark.shape.id, in: mark.shape.in, from: share(mark.start), to: share(mark.end) }
  }
  const sounds = voice.expressive ? marks.sounds.map((s) => ({ ...s, at: spoken.map(s.at) })).sort((a, b) => a.at - b.at) : []

  // The document's narration ("narrated by a tense and hushed storyteller…") colours what the
  // narrator reads; a marked line's emotion comes first. A character speaks, so isn't told to narrate.
  const narrated = narration ? `narrated by ${narration}` : undefined
  // Bangla or Hindi typed in English letters: voices take their language from the text, and these
  // letters alone say English, so the voice is told what it's reading. A part in English letters that
  // was filed as Bangla is typed Bangla even when it's too short or too English to tell by its words:
  // without the direction, that one part of a story was read as English.
  const typed = TYPED_AS[voice.language] && (typedInLatin(written) === voice.language || inLatinLetters(written)) ? TYPED_AS[voice.language] : undefined
  // Typed text is read by the larger model: on lines with English words in them the usual one
  // slipped into an American accent in half its takes (see TTS_MODEL_TYPED). A listener's own
  // voice only exists on the model it was made with.
  const onModel = (v: VoiceDefinition): VoiceDefinition => (typed && !v.own && v.model === env.TTS_MODEL_MULTILINGUAL && v.model !== env.TTS_MODEL_TYPED ? { ...v, model: env.TTS_MODEL_TYPED } : v)
  const narrator = onModel(voice)
  // A character isn't told to narrate. They're told how they sound, the same words on every line.
  // A whisper or a shout is said without either: sent along with the narrator's manner, a whisper
  // came out whispered in 4 takes of 12, and in 10 of 12 on its own (Oct 2026).
  const deliveryOf = (marked: EmotionMark | null, { voice: character, manner }: Reader) => {
    const reader = character ?? voice
    if (!reader.expressive) return undefined
    // A line performed plainly is said in the reader's own manner; the performance gives it its feeling
    const mark = performedPlainly(marked) ? null : marked
    const standing = tagOf(mark) ? undefined : character ? manner && `sounding ${manner}` : narrated
    // The script's tone is the narrator's; a character keeps their own manner, and a whisper or a shout goes without
    const tone = character || tagOf(mark) ? undefined : settings?.style
    return [typed, mark ? styleOf(mark) : undefined, standing, tone, typed ? undefined : reader.accentStyle].filter(Boolean).join(', ') || undefined
  }
  /** How one take is said, and what's checked, levelled and shaped about it */
  const deliver = (marked: EmotionMark | null, reader: Reader, span: { start: number; end: number }): Delivery => {
    const style = deliveryOf(marked, reader)
    const mark = performedPlainly(marked) ? null : marked
    const check = checkOf(mark)
    const levelDb = mark && check ? LEVEL_DB[mark.emotion] : undefined
    const shape = shapeIn(span.start, span.end)
    return { ...(style && { style }), ...(mark && check && { check, tries: triesOf(mark, check) }), ...(levelDb && { levelDb }), ...(shape && { shape }) }
  }

  const takes = takesOf(text, sentences, emotions, castSpans(text, marks.speakers.map(move), voice), deliveryOf)
  const whole = takes.length === 1 && !takes[0].voice ? takes[0] : null
  if (voice.expressive) input = tagged(withSounds(text, sounds, 0, text.length, true), whole?.mark ?? null)
  const delivery = deliver(whole?.mark ?? null, { voice: null }, { start: 0, end: text.length })

  /** Whether the words at `at` follow a comma, a dash or a quote mark, or open a quote */
  const atBreak = (at: number) => BREAK_BEFORE.test(text.slice(0, at).trimEnd()) || OPENS_QUOTE.test(text.slice(at))
  if (takes.length && !whole) {
    const cast = takes.some((take) => take.voice)
    const narratorSounds = sounds.filter((s) => !s.ai || NARRATOR_SOUNDS.has(s.sound))
    segments = takes.map((take, i) => {
      const from = take.start + (text.slice(take.start, take.end).length - text.slice(take.start, take.end).trimStart().length)
      const sentence = sentences.find((s) => s.start === from)
      return {
        text: tagged(withSounds(text, cast && !take.voice ? narratorSounds : sounds, take.start, take.end, i === takes.length - 1), take.mark),
        ...deliver(take.mark, take, take),
        // A take that starts inside a sentence starts where the voice would stop for a comma, when there is one
        gapMs: i === 0 ? 0 : !sentence ? (atBreak(from) ? GAP_CLAUSE_MS : GAP_WORD_MS) : sentence.paragraphStart ? GAP_PARAGRAPH_MS : GAP_SENTENCE_MS,
        ...(take.voice && { voice: onModel(take.voice) }),
        at: spoken.unmap(from),
      }
    })
  }

  const adjust = { speed: settings?.speed ?? 1, pitch: settings?.pitch ?? 0 }
  const adjusted = isAdjusted(adjust) ? adjust : undefined

  // A take of 0, no runs and no change of pace or pitch leave the key as it was before any existed, so no cached audio goes stale
  const key = createHash('sha256')
    .update(JSON.stringify([RENDER_VERSION, narrator.model, soundOf(voice), input, delivery.style ?? null, ...(take ? [take] : []), ...shapeKey(delivery.shape), ...segmentsKey(segments), ...adjustKey(adjusted)]))
    .digest('hex')
    .slice(0, 16)
  return { key, input, take, voice: narrator, ...delivery, ...(segments && { segments }), ...(adjusted && { adjust: adjusted }) }
}

// Bump to shape every performed line again (after changing how a take is lined up with a performance or rebuilt)
const SHAPE_VERSION = 1

/** What a performance adds to a fingerprint of the audio shaped to it (nothing when there's none) */
export const shapeKey = (shape: ShapeUse | undefined) => (shape ? [['shape', SHAPE_VERSION, shape.id, shape.from, shape.to]] : [])

/** What a change of pace or pitch adds to a fingerprint of the audio (nothing when there's none) */
export const adjustKey = (adjust: VoiceAdjust | undefined) => (adjust ? [['adjust', adjust.speed, adjust.pitch]] : [])

/** What a plan's runs add to a fingerprint of its audio (nothing when it has none) */
export const segmentsKey = (segments: SpeechSegment[] | undefined) =>
  segments ? [segments.map((s) => [s.text, s.style ?? null, s.gapMs, ...(s.voice ? [s.voice.model, soundOf(s.voice)] : []), ...shapeKey(s.shape)]), JOIN_VERSION] : []

/** "Redo this sentence" takes on a part: sentence index → take (only takes above 0) */
export function readSentenceTakes(value: unknown): Record<number, number> {
  const out: Record<number, number> = {}
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^\d+$/.test(k) && typeof v === 'number' && Number.isInteger(v) && v > 0) out[Number(k)] = v
    }
  }
  return out
}
