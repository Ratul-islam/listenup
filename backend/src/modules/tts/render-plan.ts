import { createHash } from 'node:crypto'
import { EMOTIONS, SOUNDS, type ChunkExpressions } from '../expressions/expression-catalog.js'
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

/**
 * Decides how a chunk is voiced, always in one request. Listening tests
 * (Oct 2026) showed that voicing tagged lines separately and joining them
 * makes the voice audibly change, while one request directed with
 * "natural narration, but the words "x" are said sadly" keeps one consistent
 * speaker and still shifts emotion where asked. A chunk with a single emotion
 * throughout just gets that emotion's style. Sounds are inline audio tags.
 * Voices that can't take emotions read the plain text.
 */
export function planRender(text: string, { emotions, sounds }: ChunkExpressions, voice: VoiceDefinition): RenderPlan {
  let input = text
  let style: string | undefined

  if (voice.expressive) {
    const first = text.search(/\S/)
    const last = text.trimEnd().length
    const whole = emotions.length === 1 && emotions[0].start <= first && emotions[0].end >= last
    const directions = emotions
      .map((m) => ({ words: quote(text.slice(m.start, m.end)), emotion: m.emotion }))
      .filter((d) => d.words)
      .map((d) => `the words "${d.words}" are ${EMOTIONS[d.emotion].phrase}`)
    const delivery = whole ? EMOTIONS[emotions[0].emotion].style : directions.length ? `natural narration, but ${directions.join(', and ')}` : undefined
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
