import { z } from 'zod'
import { env } from '../../config/env.js'
import type { DocumentChunk } from '../../generated/prisma/client.js'
import { chatCompletion } from '../../lib/openrouter.js'
import {
  EMOTION_IDS,
  normalizeExpressions,
  readExpressions,
  SOUND_IDS,
  type ChunkExpressions,
  type EmotionMark,
  type SoundMark,
} from './expression-catalog.js'

// Text sent per model request, and the most read from where the listener is
const BATCH_CHARS = 8_000
export const MAX_AUTO_EXPRESSION_CHARS = 400_000
const CONCURRENCY = 3

const SYSTEM = `You are a voice director preparing a text for expressive text-to-speech narration.
You get numbered sentences ("<id>: <sentence>"). Pick the sentences, or a few words inside them, whose delivery should clearly differ from neutral narration, and say how they should sound.

Emotions: ${EMOTION_IDS.join(', ')}.
Sounds (a non-verbal noise made right before a sentence or words): ${SOUND_IDS.join(', ')}.

Rules:
- Be selective. Most narration stays neutral; tag dialogue, exclamations and clearly emotional moments. Tag at most about one sentence in four.
- Use "words" only when just part of a sentence carries the emotion (for example a quoted line inside narration). Copy those words exactly from the sentence.
- Use sounds rarely, only where a person reading aloud would naturally make that noise.
- Factual, technical or instructional text usually needs no tags: return empty lists.
- The text may be English or Bangla; judge the meaning, not the language.

Reply with JSON only, in this shape:
{"emotions":[{"id":"3.2","emotion":"sad"},{"id":"3.4","emotion":"angry","words":"exact words from the sentence"}],"sounds":[{"id":"3.5","sound":"sigh"}]}`

const replySchema = z.object({
  emotions: z.array(z.unknown()).default([]),
  sounds: z.array(z.unknown()).default([]),
})
const emotionItem = z.object({ id: z.string(), emotion: z.enum(EMOTION_IDS), words: z.string().optional() })
const soundItem = z.object({ id: z.string(), sound: z.enum(SOUND_IDS), words: z.string().optional() })

interface Sentence {
  chunk: DocumentChunk
  start: number
  end: number
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

async function suggest(batch: [string, Sentence][]) {
  const reply = await chatCompletion({
    model: env.OPENROUTER_TEXT_MODEL,
    system: SYSTEM,
    content: [{ type: 'text', text: batch.map(([id, s]) => `${id}: ${s.chunk.text.slice(s.start, s.end).replace(/\s+/g, ' ')}`).join('\n') }],
    maxTokens: 4000,
    json: true,
    purpose: 'emotion suggestion',
  })
  let body: unknown
  try {
    body = JSON.parse(reply.replace(/^```(?:json)?\s*|\s*```$/g, '') || '{}')
  } catch {
    body = null // a garbled reply just means no suggestions for this batch
  }
  const parsed = replySchema.safeParse(body)
  if (!parsed.success) return { emotions: [], sounds: [] }

  const byId = new Map(batch)
  const emotions: { chunk: DocumentChunk; mark: EmotionMark }[] = []
  const sounds: { chunk: DocumentChunk; mark: SoundMark }[] = []
  for (const raw of parsed.data.emotions) {
    const item = emotionItem.safeParse(raw)
    const sentence = item.success ? byId.get(item.data.id) : undefined
    const span = sentence && item.success && locate(sentence, item.data.words)
    if (sentence && span && item.success) emotions.push({ chunk: sentence.chunk, mark: { ...span, emotion: item.data.emotion, ai: true } })
  }
  for (const raw of parsed.data.sounds) {
    const item = soundItem.safeParse(raw)
    const sentence = item.success ? byId.get(item.data.id) : undefined
    const span = sentence && item.success && locate(sentence, item.data.words)
    if (sentence && span && item.success) sounds.push({ chunk: sentence.chunk, mark: { at: span.start, sound: item.data.sound, ai: true } })
  }
  return { emotions, sounds }
}

/**
 * Suggests emotions and sounds for a run of chunks. Earlier suggestions in
 * those chunks are replaced; the listener's own marks are kept and win any
 * overlap. Returns the new expressions per chunk id.
 */
export async function autoExpress(chunks: DocumentChunk[]) {
  const batches: [string, Sentence][][] = [[]]
  let size = 0
  for (const chunk of chunks) {
    const spans = chunk.sentences as { start: number; end: number }[]
    spans.forEach((s, i) => {
      if (size > BATCH_CHARS) {
        batches.push([])
        size = 0
      }
      batches.at(-1)!.push([`${chunk.index}.${i + 1}`, { chunk, start: s.start, end: s.end }])
      size += s.end - s.start
    })
  }

  const results = []
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    results.push(...(await Promise.all(batches.slice(i, i + CONCURRENCY).filter((b) => b.length).map(suggest))))
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
