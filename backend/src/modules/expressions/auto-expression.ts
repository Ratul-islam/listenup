import { z } from 'zod'
import type { DocumentChunk } from '../../generated/prisma/client.js'
import { chatCompletion } from '../../lib/openrouter.js'
import {
  cleanDirection,
  EMOTION_IDS,
  NARRATION_STYLE_IDS,
  NARRATION_STYLES,
  normalizeExpressions,
  readExpressions,
  SOUND_IDS,
  type ChunkExpressions,
  type EmotionMark,
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

/** What the director learned about the text before directing it line by line */
export interface StoryBrief {
  style: NarrationStyleId
  /** The ideal narrator, as a noun phrase ("a hushed and tense storyteller…") */
  narrator: string
  characters: { name: string; voice: string }[]
}

const BRIEF_SYSTEM = `You are a casting director for audiobook narration. You get excerpts of one document: its opening and the part being listened to now.

Decide:
- "style": which narration style fits best, one of ${NARRATION_STYLE_IDS.join(', ')}. Fiction usually fits a story style; textbooks, notes and articles fit lecture or documentary.
- "narrator": the ideal narrator for this text as a short noun phrase of at most 12 words, no commas, that reads naturally after "narrated by". Example: "a hushed and tense storyteller with a slow deliberate pace".
- "characters": up to 8 people who speak in the text, each with "name" (as written in the text) and "voice": at most 8 words on how they sound, no commas. Example: {"name":"Montresor","voice":"cold and quietly menacing"}. Leave it empty for non-fiction.

The text may be in English, Bangla or another language; write the answer in English. Reply with JSON only:
{"style":"suspense","narrator":"…","characters":[{"name":"…","voice":"…"}]}`

const briefSchema = z.object({
  style: z.enum(NARRATION_STYLE_IDS).catch('drama'),
  narrator: z.string().catch(''),
  characters: z.array(z.object({ name: z.string(), voice: z.string() })).catch([]),
})

/** Reads samples of the text and returns its genre, ideal narrator and characters */
export async function writeBrief(samples: string[], model: string): Promise<StoryBrief> {
  const reply = await chatCompletion({
    model,
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
    characters: brief.characters
      .slice(0, 8)
      .map((c) => ({ name: c.name.trim().slice(0, 40), voice: cleanDirection(c.voice) ?? '' }))
      .filter((c) => c.name && c.voice),
  }
}

// How much of the text gets its own direction, by the listener's chosen strength
const DENSITY: Record<NarrationStrength, string> = {
  subtle: `Direct only dialogue and clearly emotional moments. Most narration stays untagged: the narrator style already covers it. Use "strong" only at real peaks. Sounds: almost never.`,
  balanced: `Direct every line of dialogue, and narration whenever its mood shifts from the narrator's usual tone (fear building, grief, a joke landing, a reveal). Plain description can stay untagged. Use "strong" at peaks. Sounds: where a performer naturally would.`,
  dramatic: `Perform it like a dramatic audiobook. Direct nearly every line of dialogue and most narration beats, so the emotion keeps moving with the story. Use "strong" generously at tense or emotional peaks, and sounds (gasps, sighs, laughs, pauses, breaths) wherever a performer would make them.`,
}

const directorSystem = (brief: StoryBrief, strength: NarrationStrength) => `You are the director of an expressive audiobook recording. The narrator is ${brief.narrator}.
${brief.characters.length ? `Characters and how they sound:\n${brief.characters.map((c) => `- ${c.name}: ${c.voice}`).join('\n')}\n` : ''}
You get the text just before this part (for context only, never tag it) and then numbered sentences ("<id>: <sentence>"). Read them as a whole: follow who is speaking, what is happening and what the reader should feel, then direct the sentences.

Emotions: ${EMOTION_IDS.join(', ')}.
Sounds (a non-verbal noise made right before a sentence or words): ${SOUND_IDS.join(', ')}.

How much to direct: ${DENSITY[strength]}

For each directed sentence give:
- "emotion": the closest emotion.
- "strong": true when it should be clearly more intense than usual.
- "words": only when just part of the sentence carries it, such as a quoted line inside narration. Copy those words exactly.
- "direction": optional, at most 8 words, no commas: exactly how it is said beyond the emotion label. Write it so it reads naturally after the word "said": "slowly with mounting dread", "as Montresor in a cold menacing hush", "with a manic little laugh in the voice". Include the feeling in it when you write one. Keep it for the lines that matter most: at most two or three per paragraph.

Judge the meaning, not the language: the text may be English, Bangla or another language. Instructional or technical text usually needs little direction.

Reply with JSON only, in this shape:
{"emotions":[{"id":"3.2","emotion":"sad"},{"id":"3.4","emotion":"angry","strong":true,"words":"exact words","direction":"as the captain roaring over the storm"}],"sounds":[{"id":"3.5","sound":"sigh"}]}`

const replySchema = z.object({
  emotions: z.array(z.unknown()).default([]),
  sounds: z.array(z.unknown()).default([]),
})
const emotionItem = z.object({
  id: z.string(),
  emotion: z.enum(EMOTION_IDS),
  strong: z.boolean().optional(),
  words: z.string().optional(),
  direction: z.string().optional(),
})
const soundItem = z.object({ id: z.string(), sound: z.enum(SOUND_IDS), words: z.string().optional() })

interface Sentence {
  chunk: DocumentChunk
  start: number
  end: number
}

const sentenceText = (s: Sentence) => s.chunk.text.slice(s.start, s.end).replace(/\s+/g, ' ').trim()

function parseJson(reply: string): unknown {
  try {
    return JSON.parse(reply.replace(/^```(?:json)?\s*|\s*```$/g, '') || '{}')
  } catch {
    return null // a garbled reply just means nothing for this request
  }
}

/** Where `words` sit in a sentence, or null when the model didn't copy them exactly */
function locate(sentence: Sentence, words: string | undefined) {
  const text = sentence.chunk.text.slice(sentence.start, sentence.end)
  if (!words?.trim()) return { start: sentence.start, end: sentence.end }
  const needle = words.trim()
  let at = text.indexOf(needle)
  if (at === -1) at = text.toLowerCase().indexOf(needle.toLowerCase())
  if (at === -1) return null
  // Nearly the whole line counts as the whole line
  if (needle.length >= text.trim().length * 0.9) return { start: sentence.start, end: sentence.end }
  return { start: sentence.start + at, end: sentence.start + at + needle.length }
}

interface Batch {
  context: string
  sentences: [string, Sentence][]
}

async function direct(batch: Batch, system: string, model: string) {
  const numbered = batch.sentences.map(([id, s]) => `${id}: ${sentenceText(s)}`).join('\n')
  const reply = await chatCompletion({
    model,
    system,
    content: [{ type: 'text', text: `${batch.context ? `Just before (context only):\n${batch.context}\n\n` : ''}Sentences:\n${numbered}` }],
    maxTokens: 8000,
    json: true,
    reasoning: 'low',
    purpose: 'emotion suggestion',
  })
  const parsed = replySchema.safeParse(parseJson(reply))
  if (!parsed.success) return { emotions: [], sounds: [] }

  const byId = new Map(batch.sentences)
  const emotions: { chunk: DocumentChunk; mark: EmotionMark }[] = []
  const sounds: { chunk: DocumentChunk; mark: SoundMark }[] = []
  for (const raw of parsed.data.emotions) {
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
  for (const raw of parsed.data.sounds) {
    const item = soundItem.safeParse(raw)
    if (!item.success) continue
    const sentence = byId.get(item.data.id)
    const span = sentence && locate(sentence, item.data.words)
    if (sentence && span) sounds.push({ chunk: sentence.chunk, mark: { at: span.start, sound: item.data.sound, ai: true } })
  }
  return { emotions, sounds }
}

export interface DirectOptions {
  brief: StoryBrief
  strength: NarrationStrength
  model: string
  /** Text right before the first chunk, so the first batch has context too */
  before?: string
}

/**
 * Directs a run of chunks line by line, with the story brief and the text
 * before each part as context. Earlier suggestions in those chunks are
 * replaced; the listener's own marks are kept and win any overlap. Returns the
 * new expressions per chunk id.
 */
export async function autoExpress(chunks: DocumentChunk[], { brief, strength, model, before = '' }: DirectOptions) {
  const all: [string, Sentence][] = []
  for (const chunk of chunks) {
    const spans = chunk.sentences as { start: number; end: number }[]
    spans.forEach((s, i) => all.push([`${chunk.index}.${i + 1}`, { chunk, start: s.start, end: s.end }]))
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

  const system = directorSystem(brief, strength)
  const results = []
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    results.push(...(await Promise.all(batches.slice(i, i + CONCURRENCY).map((b) => direct(b, system, model)))))
  }

  const next = new Map<string, ChunkExpressions>()
  for (const chunk of chunks) {
    const own = readExpressions(chunk.expressions)
    next.set(chunk.id, { emotions: own.emotions.filter((m) => !m.ai), sounds: own.sounds.filter((m) => !m.ai) })
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

  return chunks.map((chunk) => ({ id: chunk.id, expressions: normalizeExpressions(next.get(chunk.id)!, chunk.text.length) }))
}


const DESCRIBE_SYSTEM = `You turn a listener's description of how a line should sound into a direction for an expressive text-to-speech voice.

Emotions: ${EMOTION_IDS.join(', ')}.

Reply with JSON only: {"emotion":"<closest emotion>","strong":true|false,"direction":"<at most 10 words, no commas>"}
- "direction" says exactly how the line is spoken, keeping the listener's idea ("like a scared little child barely holding back tears"). It must read naturally after "said".
- "strong" is true when the description asks for a lot of feeling ("very", "really", "screaming").
- The description may be in English, Bangla or another language; write the direction in English.`

const describeSchema = z.object({ emotion: z.enum(EMOTION_IDS).catch('serious'), strong: z.boolean().catch(false), direction: z.string().catch('') })

/** "Say it like…": the listener's own words become an emotion and a direction */
export async function describeDelivery(line: string, description: string, model: string) {
  const reply = await chatCompletion({
    model,
    system: DESCRIBE_SYSTEM,
    content: [{ type: 'text', text: `Line: ${line.replace(/\s+/g, ' ').trim().slice(0, 600)}\nHow it should sound: ${description.trim().slice(0, 300)}` }],
    maxTokens: 300,
    json: true,
    purpose: 'emotion direction',
  })
  const parsed = describeSchema.parse(parseJson(reply) ?? {})
  return { emotion: parsed.emotion, strong: parsed.strong, direction: cleanDirection(parsed.direction) ?? cleanDirection(description) }
}
