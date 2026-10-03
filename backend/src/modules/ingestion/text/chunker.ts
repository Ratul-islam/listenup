import { CHARS_PER_SECOND, CHUNK_MAX_CHARS, CHUNK_TARGET_CHARS, FIRST_CHUNK_CHARS } from '../../../config/constants.js'
import { detectLanguage, type Lang } from './language.js'

export interface SentenceSpan {
  start: number
  end: number
  paragraphStart: boolean
}

export interface ChunkDraft {
  text: string
  language: Lang
  sentences: SentenceSpan[]
  estimatedDurationSec: number
}

interface Sentence {
  text: string
  language: Lang
  paragraphStart: boolean
}

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })

/** Breaks a very long sentence at clause punctuation so it fits a chunk */
function splitLong(sentence: string): string[] {
  if (sentence.length <= CHUNK_MAX_CHARS) return [sentence]
  const parts: string[] = []
  let rest = sentence
  while (rest.length > CHUNK_MAX_CHARS) {
    const window = rest.slice(0, CHUNK_MAX_CHARS)
    const cut = Math.max(
      window.lastIndexOf(', '),
      window.lastIndexOf('; '),
      window.lastIndexOf(': '),
      window.lastIndexOf(' — '),
      window.lastIndexOf(', '),
    )
    const at = cut > CHUNK_MAX_CHARS * 0.4 ? cut + 1 : window.lastIndexOf(' ') > 0 ? window.lastIndexOf(' ') : CHUNK_MAX_CHARS
    parts.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

function toSentences(paragraphs: string[]): Sentence[] {
  const out: Sentence[] = []
  for (const paragraph of paragraphs) {
    let first = true
    for (const { segment } of segmenter.segment(paragraph)) {
      for (const piece of splitLong(segment.trim())) {
        if (!piece) continue
        out.push({ text: piece, language: detectLanguage(piece), paragraphStart: first })
        first = false
      }
    }
  }
  return out
}

/**
 * Groups sentences into speech chunks of a single language. The first chunk
 * is short so audio starts fast; later chunks prefer to end at paragraphs.
 */
export function chunkParagraphs(paragraphs: string[]): ChunkDraft[] {
  const chunks: ChunkDraft[] = []
  let current: Sentence[] = []

  const flush = () => {
    if (!current.length) return
    let text = ''
    const sentences: SentenceSpan[] = []
    for (const s of current) {
      if (text) text += s.paragraphStart ? '\n' : ' '
      sentences.push({ start: text.length, end: text.length + s.text.length, paragraphStart: s.paragraphStart })
      text += s.text
    }
    const language = current[0].language
    chunks.push({ text, language, sentences, estimatedDurationSec: text.length / CHARS_PER_SECOND[language] })
    current = []
  }

  for (const sentence of toSentences(paragraphs)) {
    const size = current.reduce((n, s) => n + s.text.length + 1, 0)
    const target = chunks.length === 0 ? FIRST_CHUNK_CHARS : CHUNK_TARGET_CHARS
    const languageChanged = current.length > 0 && current[0].language !== sentence.language
    const wouldOverflow = size + sentence.text.length > CHUNK_MAX_CHARS
    const atParagraph = sentence.paragraphStart && size >= target * 0.6

    if (languageChanged || wouldOverflow || size >= target || atParagraph) flush()
    current.push(sentence)
  }
  flush()
  return chunks
}
