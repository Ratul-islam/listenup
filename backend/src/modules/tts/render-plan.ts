import { createHash } from 'node:crypto'
import { EMOTIONS, SOUNDS, type ChunkExpressions, type EmotionMark } from '../expressions/expression-catalog.js'
import type { VoiceDefinition } from '../voices/voice-catalog.js'

/** One provider request for a chunk: what to read and how */
export interface RenderPlan {
  /** Changes whenever the audio would; cached clips with another key are stale */
  key: string
  /** Chunk text with inline sound tags */
  input: string
  /** Delivery direction ("sad and tearful, in a British English accent") */
  style?: string
}

// Bump to regenerate every cached clip (e.g. after rewording styles)
const RENDER_VERSION = 1

const quote = (text: string) => text.trim().replace(/\s+/g, ' ').replace(/"/g, "'")

// Long directions drift (listening tests, Oct 2026): quote long lines by their
// ends and direct only the most important spans of a chunk
const QUOTE_MAX_WORDS = 10
const MAX_DIRECTIONS = 5

/** "And every night … oh so gently!" for a long line, so the direction stays short */
function shortQuote(text: string) {
  const words = quote(text).split(' ')
  return words.length <= QUOTE_MAX_WORDS ? words.join(' ') : `${words.slice(0, 5).join(' ')} … ${words.slice(-3).join(' ')}`
}

/** The listener's own marks first, then the strongest and most specific AI ones */
const priority = (m: EmotionMark) => (m.ai ? 0 : 4) + (m.strong ? 2 : 0) + (m.direction ? 1 : 0)

/** How a marked span is said, as it follows "the words … are" */
const phraseOf = (m: EmotionMark) => (m.direction ? `said (${m.direction})` : m.strong ? EMOTIONS[m.emotion].strongPhrase : EMOTIONS[m.emotion].phrase)
/** How a whole chunk is said, as a standalone direction */
const styleOf = (m: EmotionMark) => (m.direction ? `spoken ${m.direction}` : m.strong ? EMOTIONS[m.emotion].strongStyle : EMOTIONS[m.emotion].style)

/**
 * Decides how a chunk is voiced, always in one request. Listening tests
 * (Oct 2026) showed that voicing tagged lines separately and joining them
 * makes the voice audibly change, while one request directed with
 * "natural narration, but the words "x" are said sadly" keeps one consistent
 * speaker and still shifts emotion where asked. A chunk with a single emotion
 * throughout just gets that emotion's style. Sounds are inline audio tags.
 * Voices that can't take emotions read the plain text.
 */
export function planRender(text: string, { emotions, sounds }: ChunkExpressions, voice: VoiceDefinition, narration?: string | null): RenderPlan {
  let input = text
  let style: string | undefined

  if (voice.expressive) {
    const first = text.search(/\S/)
    const last = text.trimEnd().length
    const whole = emotions.length === 1 && emotions[0].start <= first && emotions[0].end >= last
    const directions = emotions
      .map((m, i) => ({ words: shortQuote(text.slice(m.start, m.end)), mark: m, i }))
      .filter((d) => d.words)
      .sort((a, b) => priority(b.mark) - priority(a.mark) || a.i - b.i)
      .slice(0, MAX_DIRECTIONS)
      .sort((a, b) => a.i - b.i)
      .map((d) => `the words "${d.words}" are ${phraseOf(d.mark)}`)
    // The document's narration ("narrated by a tense and hushed storyteller…") colours
    // every line; tagged words and lines are directed on top of it
    const narrated = narration ? `narrated by ${narration}` : undefined
    const delivery = whole
      ? [styleOf(emotions[0]), narrated].filter(Boolean).join(', ')
      : directions.length
        ? `${narrated ?? 'natural narration'}, but ${directions.join(', and ')}`
        : narrated
    style = [delivery, voice.accentStyle].filter(Boolean).join(', ') || undefined

    // Sound tags go in front of the word they're attached to
    let cursor = 0
    input = ''
    for (const s of sounds) {
      input += `${text.slice(cursor, s.at)}${SOUNDS[s.sound]} `
      cursor = s.at
    }
    input = (input + text.slice(cursor)).replace(/ {2,}/g, ' ').trim()
  }

  const key = createHash('sha256')
    .update(JSON.stringify([RENDER_VERSION, voice.model, voice.providerVoice, input, style ?? null]))
    .digest('hex')
    .slice(0, 16)
  return { key, input, style }
}
