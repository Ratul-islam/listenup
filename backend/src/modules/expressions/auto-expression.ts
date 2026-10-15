import { z } from 'zod'
import type { DocumentChunk } from '../../generated/prisma/client.js'
import { chatCompletion } from '../../lib/openrouter.js'
import { quoteSpans, type QuoteSpan } from '../../lib/quotes.js'
import { AppError } from '../../utils/AppError.js'
import {
  cleanDirection,
  EMOTION_IDS,
  NARRATION_STYLE_IDS,
  NARRATION_STYLES,
  normalizeExpressions,
  readExpressions,
  SOUND_IDS,
  type ChunkExpressions,
  type EmotionId,
  type EmotionMark,
  type Gender,
  type NarrationStrength,
  type NarrationStyleId,
  type SoundMark,
} from './expression-catalog.js'

// Text sent per model request, and the most read from where the listener is
const BATCH_CHARS = 6_000
export const MAX_AUTO_EXPRESSION_CHARS = 400_000
// The least worth a run, even with few Expressive minutes left
export const MIN_AUTO_EXPRESSION_CHARS = 20_000
// Text before each batch, so the model knows what's going on (not tagged)
const CONTEXT_CHARS = 1_200
// What the brief reads: the opening and the part being listened to
export const BRIEF_SAMPLE_CHARS = 6_000
const CONCURRENCY = 3

/** Someone who speaks in the story */
export interface StoryCharacter {
  name: string
  /** How they sound, in a few words */
  voice: string
  gender?: Gender
  /** Their place among the story's characters of the same gender. Given once and kept, so they keep their voice across runs. */
  rank: number
  /** The voice the listener chose for them, in place of the automatic one */
  voiceId?: string
}

/** What the director learned about the text before directing it line by line */
export interface StoryBrief {
  style: NarrationStyleId
  /** The ideal narrator, as a noun phrase ("a hushed and tense storyteller…") */
  narrator: string
  characters: StoryCharacter[]
}

// A story's cast stops growing here; later names read in the narrator's voice
const MAX_CHARACTERS = 16
// Text read per request when looking through everything being directed for the people who speak
const CAST_WINDOW_CHARS = 25_000

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The characters a document already has, from its saved brief (older briefs have no ranks: they get them in order) */
export function readCast(brief: unknown): StoryCharacter[] {
  const list = (brief as { characters?: unknown } | null)?.characters
  if (!Array.isArray(list)) return []
  const cast: StoryCharacter[] = []
  for (const c of list as Partial<StoryCharacter>[]) {
    if (typeof c?.name !== 'string' || !c.name.trim()) continue
    const gender = c.gender === 'female' || c.gender === 'male' ? c.gender : undefined
    cast.push({
      name: c.name,
      voice: typeof c.voice === 'string' ? c.voice : '',
      ...(gender && { gender }),
      rank: Number.isInteger(c.rank) ? (c.rank as number) : cast.filter((k) => k.gender === gender).length,
      ...(typeof c.voiceId === 'string' && { voiceId: c.voiceId }),
    })
  }
  return cast
}

/** Adds newly found characters to the cast. The ones already there stay exactly as they are, voice and all. */
function mergeCast(known: StoryCharacter[], found: { name: string; voice: string; gender?: Gender }[]): StoryCharacter[] {
  const cast = known.map((c) => ({ ...c }))
  for (const c of found) {
    if (cast.some((k) => sameName(k.name, c.name)) || cast.length >= MAX_CHARACTERS) continue
    cast.push({ name: c.name, voice: c.voice, ...(c.gender && { gender: c.gender }), rank: cast.filter((k) => k.gender === c.gender).length })
  }
  return cast
}

const BRIEF_SYSTEM = `You are a casting director for audiobook narration. You get excerpts of one document: its opening and the part being listened to now.

Decide:
- "style": which narration style fits best, one of ${NARRATION_STYLE_IDS.join(', ')}. Fiction usually fits a story style; textbooks, notes and articles fit lecture or documentary.
- "narrator": the ideal narrator for this text as a short noun phrase of at most 12 words, no commas, that reads naturally after "narrated by". Example: "a hushed and tense storyteller with a slow deliberate pace".
- "characters": up to 8 people who speak in the text, each with "name" (as written in the text, in the text's own script), "gender" ("female", "male" or "unknown") and "voice": at most 8 words on how they sound, no commas, as a phrase that reads naturally after "sounding". Example: {"name":"Montresor","gender":"male","voice":"cold and quietly menacing"}. Leave it empty for non-fiction.

The text may be in English, Bangla or another language; write "narrator" and "voice" in English. Reply with JSON only:
{"style":"suspense","narrator":"…","characters":[{"name":"…","gender":"female","voice":"…"}]}`

const briefSchema = z.object({
  style: z.enum(NARRATION_STYLE_IDS).catch('drama'),
  narrator: z.string().catch(''),
  characters: z.array(z.object({ name: z.string(), voice: z.string().catch(''), gender: z.enum(['female', 'male', 'unknown']).catch('unknown') })).catch([]),
})

/**
 * Reads samples of the text and returns its genre, ideal narrator and
 * characters. `known` is the cast from earlier runs: they keep their place
 * (and so their voices), and newly met characters join after them.
 */
export async function writeBrief(samples: string[], model: string, userId: string, known: StoryCharacter[] = []): Promise<StoryBrief> {
  const reply = await chatCompletion({
    model,
    userId,
    system: BRIEF_SYSTEM,
    content: [{ type: 'text', text: samples.map((s, i) => `Excerpt ${i + 1}:\n${s}`).join('\n\n---\n\n') }],
    maxTokens: 1500,
    json: true,
    reasoning: 'medium',
    purpose: 'story brief',
  })
  const parsed = briefSchema.safeParse(parseJson(reply))
  const brief = parsed.success ? parsed.data : briefSchema.parse({})
  return {
    style: brief.style,
    narrator: cleanDirection(brief.narrator) ?? NARRATION_STYLES[brief.style],
    characters: mergeCast(
      known,
      brief.characters
        .slice(0, 8)
        .map((c) => ({ name: c.name.trim().slice(0, 40), voice: cleanDirection(c.voice) ?? '', ...(c.gender !== 'unknown' && { gender: c.gender }) }))
        .filter((c) => c.name),
    ),
  }
}

const castSystem = (known: { name: string; gender?: Gender }[]) => `You find the people who speak in one stretch of a longer story, so that each can be given their own voice actor.
${known.length ? `Found so far in the story:\n${known.map((c) => `- ${c.name}${c.gender ? ` (${c.gender})` : ''}`).join('\n')}\n` : ''}
List every person who says three or more lines aloud in this text, with "lines": roughly how many. Skip people who say only a line or two, crowds, and anyone who is only talked about. An empty list is a fine answer.

Someone already found is listed under exactly the name above, even where this text uses another name or a nickname for them. For someone new give "name" (as the text writes it most often, in the text's own script), "gender" and "voice": at most 8 words on how they sound, no commas, as a phrase that reads naturally after "sounding". Example: {"name":"Montresor","gender":"male","voice":"cold and quietly menacing","lines":12}.

"gender" decides whether a man or a woman reads them, so take care over it: "female", "male", or "unknown" when the text doesn't settle it. Pronouns don't show it in every language (Bangla's don't). Go by the name itself, by kinship and address words (mother, sister, wife, uncle, sir), and by what the story says about them.

The text may be in English, Bangla or another language; write "voice" in English. Reply with JSON only:
{"characters":[{"name":"…","gender":"female","voice":"…","lines":5}]}`

const castSchema = z.object({
  characters: z.array(z.object({ name: z.string(), voice: z.string().catch(''), gender: z.enum(['female', 'male', 'unknown']).catch('unknown'), lines: z.number().catch(3) })).catch([]),
})

/**
 * The people who speak anywhere in the text being directed, added to the cast
 * the brief found. The brief reads only the opening and the part being
 * listened to, so in a book everyone met later had no voice: their lines were
 * the narrator's while the opening's characters had their own. The text is
 * read a stretch at a time, one after another, each request told who's been
 * found so far, so nobody is cast twice under two names. Where there are more
 * people than the cast holds, those who say the most get in, not those who
 * happen to come first.
 */
export async function findCast(texts: string[], model: string, userId: string, known: StoryCharacter[]): Promise<StoryCharacter[]> {
  const windows: string[] = []
  let window = ''
  for (const text of texts) {
    if (window && window.length + text.length > CAST_WINDOW_CHARS) {
      windows.push(window)
      window = ''
    }
    window += `${text}\n`
  }
  if (window.trim()) windows.push(window)

  const found: { name: string; voice: string; gender?: Gender; lines: number }[] = []
  for (const text of windows) {
    // A stretch that can't be read leaves its newcomers to the narrator; the rest of the cast stands
    const reply = await chatCompletion({ model, userId, system: castSystem([...known, ...found]), content: [{ type: 'text', text }], maxTokens: 2000, json: true, reasoning: 'low', purpose: 'story cast' }).catch(() => '')
    const parsed = castSchema.safeParse(parseJson(reply))
    if (!parsed.success) continue
    for (const c of parsed.data.characters) {
      const name = c.name.trim().slice(0, 40)
      if (!name || known.some((k) => sameName(k.name, name))) continue
      const seen = found.find((f) => sameName(f.name, name))
      if (seen) seen.lines += c.lines
      else found.push({ name, voice: cleanDirection(c.voice) ?? '', ...(c.gender !== 'unknown' && { gender: c.gender }), lines: c.lines })
    }
  }
  return mergeCast(known, found.sort((a, b) => b.lines - a.lines).map(({ lines: _lines, ...character }) => character))
}

// How much of the text gets its own direction, by the listener's chosen strength
const DENSITY: Record<NarrationStrength, string> = {
  subtle: `Direct only dialogue and clearly emotional moments. Most narration stays untagged: the narrator style already covers it. Use "strong" only at real peaks. Sounds: almost never.`,
  balanced: `Direct every line of dialogue, and narration whenever its mood shifts from the narrator's usual tone (fear building, grief, a joke landing, a reveal). Plain description can stay untagged. Use "strong" at peaks. Sounds: where a performer naturally would.`,
  dramatic: `Perform it like a dramatic audiobook. Direct nearly every line of dialogue and most narration beats, so the emotion keeps moving with the story. Use "strong" generously at tense or emotional peaks, and sounds (gasps, sighs, laughs, pauses, breaths) wherever a performer would make them.`,
}

const directorSystem = (brief: StoryBrief, strength: NarrationStrength) => `You are the director of an expressive audiobook recording. The narrator is ${brief.narrator}.
${brief.characters.length ? `Characters and how they sound:\n${brief.characters.map((c) => `- ${c.name}: ${c.voice || 'no notes'}`).join('\n')}\n` : ''}
You get the text just before this part (for context only, never tag it) and then numbered sentences ("<id>: <sentence>"), with a blank line between paragraphs. Read them as a whole: follow who is speaking, what is happening and what the reader should feel, then direct the sentences.

Emotions: ${EMOTION_IDS.join(', ')}.
Sounds (a non-verbal noise made right before a sentence or words): ${SOUND_IDS.join(', ')}.

How much to direct: ${DENSITY[strength]}

For each directed sentence give:
- "emotion": the closest emotion.
- "strong": true when it should be clearly more intense than usual.
- "words": only when just part of the sentence carries it, such as a quoted line inside narration. Copy those words exactly.
- "direction": optional, at most 8 words, no commas: exactly how it is said beyond the emotion label. Write it so it reads naturally after the word "said": "slowly with mounting dread", "as Montresor in a cold menacing hush", "with a manic little laugh in the voice". Include the feeling in it when you write one. Keep it for the lines that matter most: at most two or three per paragraph.

Direct in beats, not line by line. Each stretch you direct is recorded as its own take, and too many different takes make the reader sound like several people. So:
- Sentences next to each other in the same mood get the same emotion and, if any, exactly the same direction, so they are performed as one take.
- Plain narration between the lines of dialogue stays undirected: the narrator already covers it.
- Give a line its own direction only where the delivery really changes.

Judge the meaning, not the language: the text may be English, Bangla or another language. Instructional or technical text usually needs little direction.

Reply with JSON only, in this shape:
{"emotions":[{"id":"3.2","emotion":"sad"},{"id":"3.4","emotion":"angry","strong":true,"words":"exact words","direction":"as the captain roaring over the storm"}],"sounds":[{"id":"3.5","sound":"sigh"}]}`

// Marks a sentence the server already knows has quoted speech in it
const SPEECH_TAG = '[speech]'

/**
 * Who says what is asked on its own, not as a side job of directing emotions:
 * asked together, about half the spoken lines came back with no speaker, so a
 * character was in their own voice for one line and the narrator's for the next.
 */
const speakerSystem = (cast: StoryCharacter[]) => `You work out who says each spoken line in a story, so that every character can be read by their own voice actor.

Characters:
${cast.map((c) => `- ${c.name}${c.gender ? ` (${c.gender})` : ''}`).join('\n')}

You get the text just before this part (for context only) and then numbered sentences ("<id>: <sentence>"), with a blank line between paragraphs. Sentences marked ${SPEECH_TAG} have quoted speech in them. A text may also be written without quote marks: then find the spoken lines yourself.

For every sentence in which someone speaks aloud, give:
- "id": the sentence's id.
- "name": the speaker's name exactly as listed above, or "other" when the speaker is nobody on the list or you can't tell.
- "words": only the words said aloud, copied exactly from the sentence. Leave out the narration around them (the speaker's name, "she said", what they did). Give "words" whenever the sentence has anything besides the speech itself.

How to work it out:
- Go through the sentences in order and follow the conversation line by line. Every sentence marked ${SPEECH_TAG} must be in your answer, short replies included.
- Most lines don't name their speaker. In a conversation, each new paragraph of speech is usually the other person answering. Check each answer against what is said: nobody answers their own question, and nobody addresses themselves by name.
- A character may speak before the story names them ("a voice", "the girl", "the old man"). If the rest of the text shows it's one of the listed characters, use their listed name.
- Narration, thoughts, and letters or signs being read are not speech.

The text may be in English, Bangla or another language, or a mix. Reply with JSON only, in this shape:
{"speakers":[{"id":"3.4","name":"Montresor","words":"exact spoken words"},{"id":"3.5","name":"other"}]}`

const replySchema = z.object({
  emotions: z.array(z.unknown()).default([]),
  sounds: z.array(z.unknown()).default([]),
})

/**
 * The director's marks from its reply. It's asked for one object, but models
 * also answer with a list of such objects (one per paragraph), or a bare list
 * of emotions; all of them are read. Null when nothing in it can be.
 */
function readReply(reply: string): z.infer<typeof replySchema> | null {
  const value = parseJson(reply)
  const whole = replySchema.safeParse(value)
  if (whole.success && !Array.isArray(value)) return whole.data
  if (!Array.isArray(value)) return null
  const parts = value.map((v) => replySchema.safeParse(v)).filter((r) => r.success).map((r) => r.data)
  // A list with no wrapper at all: the items are the emotions
  if (!parts.some((r) => r.emotions.length || r.sounds.length)) return { emotions: value, sounds: [] }
  return { emotions: parts.flatMap((r) => r.emotions), sounds: parts.flatMap((r) => r.sounds) }
}
const emotionItem = z.object({
  id: z.string(),
  emotion: z.enum(EMOTION_IDS),
  strong: z.boolean().optional(),
  words: z.string().optional(),
  direction: z.string().optional(),
})
const soundItem = z.object({ id: z.string(), sound: z.enum(SOUND_IDS), words: z.string().optional() })
const speakerItem = z.object({ id: z.string(), name: z.string(), words: z.string().optional() })

interface Sentence {
  chunk: DocumentChunk
  start: number
  end: number
  paragraphStart?: boolean
}

const sentenceText = (s: Sentence) => s.chunk.text.slice(s.start, s.end).replace(/\s+/g, ' ').trim()

function parseJson(reply: string): unknown {
  try {
    return JSON.parse(reply.replace(/^```(?:json)?\s*|\s*```$/g, '') || '{}')
  } catch {
    return null // a garbled reply just means nothing for this request
  }
}

/** Where `words` sit in a sentence; the whole sentence when the model didn't copy them exactly (the direction is still meant for this line) */
function locate(sentence: Sentence, words: string | undefined) {
  const text = sentence.chunk.text.slice(sentence.start, sentence.end)
  if (!words?.trim()) return { start: sentence.start, end: sentence.end }
  const needle = words.trim()
  let at = text.indexOf(needle)
  if (at === -1) at = text.toLowerCase().indexOf(needle.toLowerCase())
  if (at === -1) return { start: sentence.start, end: sentence.end }
  // Nearly the whole line counts as the whole line
  if (needle.length >= text.trim().length * 0.9) return { start: sentence.start, end: sentence.end }
  return { start: sentence.start + at, end: sentence.start + at + needle.length }
}

// Quote marks and the punctuation that hugs spoken words
const EDGES = /^[\s"'“”‘’«»‹›「」『』,.;:!?।—–-]+|[\s"'“”‘’«»‹›「」『』,;:—–-]+$/gu

/**
 * Where the words a character says sit in a sentence that has no quote marks.
 * Null when the model's copy of them can't be found: a line read by the
 * narrator is a small loss, narration read in a character's voice is a mistake
 * everyone hears.
 */
function spokenSpan(sentence: Sentence, words: string | undefined, speaker: string) {
  const text = sentence.chunk.text.slice(sentence.start, sentence.end)
  const needle = words?.trim()
  if (!needle) {
    // The whole sentence, unless it opens with the speaker's own name: that's "Name said, …" or a script's "Name: …"
    return text.trimStart().toLowerCase().startsWith(speaker.trim().toLowerCase()) ? null : { start: sentence.start, end: sentence.end }
  }
  for (const candidate of [needle, needle.replace(EDGES, '')]) {
    if (!candidate) continue
    let at = text.indexOf(candidate)
    if (at === -1) at = text.toLowerCase().indexOf(candidate.toLowerCase())
    if (at !== -1) return { start: sentence.start + at, end: sentence.start + at + candidate.length }
  }
  return null
}

interface Batch {
  context: string
  sentences: [string, Sentence][]
}

const batchText = (batch: Batch, tag?: (s: Sentence) => boolean) =>
  // A blank line between paragraphs: a new paragraph of speech is how a change of speaker is written
  `${batch.context ? `Just before (context only):\n${batch.context}\n\n` : ''}Sentences:\n${batch.sentences
    .map(([id, s], i) => `${i > 0 && s.paragraphStart ? '\n' : ''}${id}${tag?.(s) ? ` ${SPEECH_TAG}` : ''}: ${sentenceText(s)}`)
    .join('\n')}`

/** Who speaks in which sentence of a batch, and which of its words are theirs */
async function attribute(batch: Batch, system: string, model: string, userId: string, hasQuote: (s: Sentence) => boolean) {
  const reply = await chatCompletion({
    model,
    userId,
    system,
    content: [{ type: 'text', text: batchText(batch, hasQuote) }],
    maxTokens: 8000,
    json: true,
    reasoning: 'medium',
    purpose: 'speaker attribution',
  })
  const value = parseJson(reply) as { speakers?: unknown } | unknown[] | null
  const list = Array.isArray(value) ? value : Array.isArray(value?.speakers) ? value.speakers : null
  if (!list) {
    console.warn(`[expressions] the speakers reply couldn't be read: ${reply.slice(0, 200)}`)
    return []
  }
  const byId = new Map(batch.sentences)
  const speakers: { sentence: Sentence; name: string; words?: string }[] = []
  for (const raw of list) {
    const item = speakerItem.safeParse(raw)
    const sentence = item.success ? byId.get(item.data.id) : undefined
    if (item.success && sentence) speakers.push({ sentence, name: item.data.name, words: item.data.words })
  }
  return speakers
}

async function direct(batch: Batch, system: string, model: string, userId: string) {
  const reply = await chatCompletion({
    model,
    userId,
    system,
    content: [{ type: 'text', text: batchText(batch) }],
    maxTokens: 8000,
    json: true,
    reasoning: 'low',
    purpose: 'emotion suggestion',
  })
  const parsed = readReply(reply)
  if (!parsed) {
    console.warn(`[expressions] the director's reply couldn't be read: ${reply.slice(0, 200)}`)
    return { emotions: [], sounds: [], unread: true }
  }

  const byId = new Map(batch.sentences)
  const emotions: { chunk: DocumentChunk; mark: EmotionMark }[] = []
  const sounds: { chunk: DocumentChunk; mark: SoundMark }[] = []
  for (const raw of parsed.emotions) {
    const item = emotionItem.safeParse(raw)
    if (!item.success) continue
    const sentence = byId.get(item.data.id)
    const span = sentence && locate(sentence, item.data.words)
    if (!sentence || !span) continue
    const direction = cleanDirection(item.data.direction)
    emotions.push({
      chunk: sentence.chunk,
      mark: { ...span, emotion: item.data.emotion, ...(item.data.strong && { strong: true }), ...(direction && { direction }), ai: true },
    })
  }
  for (const raw of parsed.sounds) {
    const item = soundItem.safeParse(raw)
    if (!item.success) continue
    const sentence = byId.get(item.data.id)
    const span = sentence && locate(sentence, item.data.words)
    if (sentence && span) sounds.push({ chunk: sentence.chunk, mark: { at: span.start, sound: item.data.sound, ai: true } })
  }
  return { emotions, sounds, unread: false }
}

export interface DirectOptions {
  brief: StoryBrief
  strength: NarrationStrength
  model: string
  /** Text right before the first chunk, so the first batch has context too */
  before?: string
  /** Whose document it is (for the daily spending caps) */
  userId: string
}

/**
 * Directs a run of chunks line by line, with the story brief and the text
 * before each part as context. Earlier suggestions in those chunks are
 * replaced; the listener's own marks are kept and win any overlap. Returns the
 * new expressions per chunk id.
 */
export async function autoExpress(chunks: DocumentChunk[], { brief, strength, model, before = '', userId }: DirectOptions) {
  const all: [string, Sentence][] = []
  for (const chunk of chunks) {
    const spans = chunk.sentences as { start: number; end: number; paragraphStart?: boolean }[]
    spans.forEach((s, i) => all.push([`${chunk.index}.${i + 1}`, { chunk, start: s.start, end: s.end, paragraphStart: s.paragraphStart }]))
  }

  const batches: Batch[] = []
  let size = Infinity
  all.forEach((entry, i) => {
    if (size > BATCH_CHARS) {
      let context = ''
      for (let j = i - 1; j >= 0 && context.length < CONTEXT_CHARS; j--) context = `${sentenceText(all[j][1])} ${context}`
      if (context.length < CONTEXT_CHARS) context = `${before.slice(-(CONTEXT_CHARS - context.length))} ${context}`
      batches.push({ context: context.trim().slice(-CONTEXT_CHARS), sentences: [] })
      size = 0
    }
    batches.at(-1)!.sentences.push(entry)
    size += entry[1].end - entry[1].start
  })

  const quotes = new Map<string, QuoteSpan[]>(chunks.map((chunk) => [chunk.id, quoteSpans(chunk.text)]))
  /** The quoted speech (with words in it) that a sentence holds or is part of */
  const quotesIn = (s: Sentence) =>
    quotes.get(s.chunk.id)!.filter((q) => q.end > s.start && q.start < s.end && /[\p{L}\p{N}]/u.test(s.chunk.text.slice(Math.max(q.start, s.start), Math.min(q.end, s.end))))

  const system = directorSystem(brief, strength)
  const casting = brief.characters.length ? speakerSystem(brief.characters) : null
  const results = []
  const spoken: Awaited<ReturnType<typeof attribute>> = []
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const group = batches.slice(i, i + CONCURRENCY)
    const [directed, attributed] = await Promise.all([
      Promise.all(group.map((b) => direct(b, system, model, userId))),
      // A failed casting request leaves those lines to the narrator; the emotions still stand
      Promise.all(group.map((b) => (casting ? attribute(b, casting, model, userId, (s) => quotesIn(s).length > 0).catch(() => []) : []))),
    ])
    results.push(...directed)
    spoken.push(...attributed.flat())
  }

  // Nothing readable came back at all: that's a failed run to try again, not a story with no emotion in it
  if (results.length && results.every((r) => r.unread)) throw new AppError("The AI director's answers couldn't be read", 502, 'PROVIDER_ERROR')

  const next = new Map<string, ChunkExpressions>()
  for (const chunk of chunks) {
    const own = readExpressions(chunk.expressions)
    next.set(chunk.id, { emotions: own.emotions.filter((m) => !m.ai), sounds: own.sounds.filter((m) => !m.ai), speakers: own.speakers.filter((m) => !m.ai) })
  }
  for (const { emotions, sounds } of results) {
    for (const { chunk, mark } of emotions) {
      const e = next.get(chunk.id)!
      if (!e.emotions.some((m) => !m.ai && m.start < mark.end && m.end > mark.start)) e.emotions.push(mark)
    }
    for (const { chunk, mark } of sounds) {
      const e = next.get(chunk.id)!
      if (!e.sounds.some((m) => m.at === mark.at)) e.sounds.push(mark)
    }
  }
  for (const { sentence, name, words } of spoken) {
    const character = brief.characters.find((c) => sameName(c.name, name))
    if (!character) continue
    const { chunk } = sentence
    // Their words are the quoted ones; the "she said" around them stays the narrator's. A quote that runs
    // over several sentences is theirs to its end, whichever of its sentences was named. Where the
    // sentence has no quote marks (older prose, a script), they're the words the model picked out.
    const quoted = quotesIn(sentence)
    const said = quoted.length ? null : spokenSpan(sentence, words, character.name)
    const lines = quoted.length ? quoted : said ? [said] : []
    const e = next.get(chunk.id)!
    for (const line of lines) {
      if (e.speakers.some((m) => m.start < line.end && m.end > line.start)) continue
      e.speakers.push({
        ...line,
        name: character.name,
        ...(character.gender && { gender: character.gender }),
        rank: character.rank,
        ...(character.voiceId && { voiceId: character.voiceId }),
        ...(character.voice && { manner: character.voice }),
        ai: true,
      })
    }
  }

  // Where characters speak, the voices carry the scene: each character keeps their one manner and the
  // narrator one voice (see takesOf in render-plan), so the director's feelings there would be shown on
  // the lines and change nothing in the audio. They're left out, and so are the sounds it gave the narrator.
  for (const e of next.values()) {
    if (!e.speakers.length) continue
    e.emotions = e.emotions.filter((m) => !m.ai)
    e.sounds = e.sounds.filter((m) => !m.ai || m.sound === 'pause' || m.sound === 'long-pause' || m.sound === 'breath' || e.speakers.some((line) => m.at >= line.start && m.at < line.end))
  }

  return chunks.map((chunk) => ({ id: chunk.id, expressions: normalizeExpressions(next.get(chunk.id)!, chunk.text.length) }))
}


const DESCRIBE_SYSTEM = `You turn a listener's description of how a line should sound into a direction for an expressive text-to-speech voice.

Emotions: ${EMOTION_IDS.join(', ')}.

Reply with JSON only: {"emotion":"<closest emotion>","strong":true|false,"direction":"<at most 10 words, no commas>"}
- "direction" says exactly how the line is spoken, keeping the listener's idea ("like a scared little child barely holding back tears"). It must read naturally after "said".
- "strong" is true when the description asks for a lot of feeling ("very", "really", "screaming").
- The description may be in English, Bangla or another language; write the direction in English.`

const describeSchema = z.object({ emotion: z.enum(EMOTION_IDS).catch('serious'), strong: z.boolean().catch(false), direction: z.string().catch('') })

const HEAR_SYSTEM = `A listener recorded themselves saying a line the way they want an expressive text-to-speech voice to say it. Listen to HOW they say it, not to who they are: another voice will say the line.

Emotions: ${EMOTION_IDS.join(', ')}.

Reply with JSON only: {"said":true|false,"emotion":"<closest emotion>","strong":true|false,"pace":"slow"|"normal"|"fast","direction":"<at most 12 words, no commas>","pauses":[{"before":"<words from the line>","long":true|false}]}
- "said" is false when the recording isn't this line: other words, only noise, or nothing. Small slips, a missed word and any accent are fine.
- "direction" says exactly how the line is spoken: the feeling, how loud, and what is stressed, so that an actor who never heard the recording would say it the same way. It must read naturally after "said". Describe what you hear, not what the words mean: a sad sentence said cheerfully is cheerful.
- "strong" is true when the feeling is clearly intense.
- "pace": how fast it is said, against ordinary reading aloud. "slow" and "fast" only when it's clearly one or the other.
- "pauses": only clear, deliberate stops, longer than the breath a reader takes between two sentences; at most 3. "before" is the two or three words that come right after the stop, copied exactly from the line. "long" when the stop lasts about a second or more. Leave the list empty when there are none.
- Write the direction in English, whatever language the line is in.`

const hearSchema = z.object({
  said: z.boolean().catch(true),
  emotion: z.enum(EMOTION_IDS).catch('serious'),
  strong: z.boolean().catch(false),
  pace: z.enum(['slow', 'normal', 'fast']).catch('normal'),
  direction: z.string().catch(''),
  pauses: z.array(z.object({ before: z.string(), long: z.boolean().catch(false) })).catch([]),
})

// Words in a direction that say how fast
const SAYS_SLOW = /\b(slow|slowly|unhurried|drawn|dragging|lingering)\b/gi
const SAYS_FAST = /\b(fast|quick|quickly|rapid|rapidly|hurried|hurriedly|rushed|rushing|brisk|briskly)\b/gi
const PACE_WORD = { slow: 'slowly', fast: 'quickly' } as const
// A recording this far from the usual pace (see paceOf) is fast or slow whatever the model heard…
const CLEARLY_FAST = 1.3
const CLEARLY_SLOW = 0.62
// …and one the model calls fast or slow is only that if the clock doesn't say otherwise
const NOT_FAST = 1.1
const NOT_SLOW = 0.9

/** Fast or slow, when a recording clearly is: by the clock where that's decisive, otherwise by ear */
function paceHeard(heard: 'slow' | 'normal' | 'fast', measured: number | null | undefined): 'slow' | 'fast' | null {
  if (measured != null && measured >= CLEARLY_FAST) return 'fast'
  if (measured != null && measured <= CLEARLY_SLOW) return 'slow'
  if (heard === 'fast') return measured == null || measured > NOT_FAST ? 'fast' : null
  if (heard === 'slow') return measured == null || measured < NOT_SLOW ? 'slow' : null
  return null
}

/** How a listener said a line in their own recording */
export interface HeardDelivery {
  /** False when the recording isn't the line at all */
  said: boolean
  emotion: EmotionId
  strong: boolean
  direction?: string
  /** Where they stopped, as offsets in the line */
  pauses: { at: number; long: boolean }[]
}

/**
 * "Say it yourself": the listener's recording of a line becomes an emotion, a
 * direction and the pauses they made. The voices take a written direction, not
 * a recording, so what carries over is the manner (feeling, speed, loudness,
 * pauses), not the exact tune. `pace` is how fast it was said by the clock
 * (see paceOf): the model hears a slow reading but not a fast one.
 */
export async function hearDelivery(line: string, mp3: Buffer, model: string, userId: string, pace?: number | null): Promise<HeardDelivery> {
  const reply = await chatCompletion({
    model,
    userId,
    system: HEAR_SYSTEM,
    content: [
      { type: 'text', text: `Line: ${line.replace(/\s+/g, ' ').trim().slice(0, 800)}\nThe recording:` },
      { type: 'input_audio', input_audio: { data: mp3.toString('base64'), format: 'mp3' } },
    ],
    maxTokens: 500,
    json: true,
    reasoning: 'low',
    purpose: 'recorded direction',
  })
  const value = parseJson(reply)
  // No answer that can be read is a failed listen, not a line said plainly
  if (!value || typeof value !== 'object') throw new AppError("We couldn't make out how you said it. Record it again.", 502, 'PROVIDER_ERROR')
  const heard = hearSchema.parse(value)
  const lower = line.toLowerCase()
  const pauses: HeardDelivery['pauses'] = []
  for (const pause of heard.pauses.slice(0, 3)) {
    const words = pause.before.trim().toLowerCase()
    const at = words ? lower.indexOf(words) : -1
    // At the very start there's nothing to pause between; twice in the line and it can't be placed
    if (at <= 0 || lower.indexOf(words, at + 1) !== -1 || pauses.some((p) => p.at === at)) continue
    // Any voice stops between two sentences; only a long stop there was the speaker's own
    if (!pause.long && /[.!?।…]["”’»)]*$/u.test(line.slice(0, at).trimEnd())) continue
    pauses.push({ at, long: pause.long })
  }
  // The pace goes first, in the same word each time; what the direction says about speed gives way to it
  const speed = paceHeard(heard.pace, pace)
  const said = (heard.direction ?? '').replace(speed === 'fast' ? SAYS_SLOW : speed === 'slow' ? SAYS_FAST : /$^/, '').replace(speed ? (speed === 'fast' ? SAYS_FAST : SAYS_SLOW) : /$^/, '')
  return { said: heard.said, emotion: heard.emotion, strong: heard.strong, direction: cleanDirection([speed && PACE_WORD[speed], said].filter(Boolean).join(' ')), pauses }
}

/** "Say it like…": the listener's own words become an emotion and a direction */
export async function describeDelivery(line: string, description: string, model: string, userId: string) {
  const reply = await chatCompletion({
    model,
    userId,
    system: DESCRIBE_SYSTEM,
    content: [{ type: 'text', text: `Line: ${line.replace(/\s+/g, ' ').trim().slice(0, 600)}\nHow it should sound: ${description.trim().slice(0, 300)}` }],
    maxTokens: 300,
    json: true,
    purpose: 'emotion direction',
  })
  const parsed = describeSchema.parse(parseJson(reply) ?? {})
  return { emotion: parsed.emotion, strong: parsed.strong, direction: cleanDirection(parsed.direction) ?? cleanDirection(description) }
}
