import { CHARS_PER_SECOND, CHUNK_MAX_CHARS, CHUNK_TARGET_CHARS, FIRST_CHUNK_CHARS } from '../../../config/constants.js'
import { detectLanguage, isEnglishPassage, isLatinOnly, READS_ENGLISH, type Lang, type ScriptLanguages } from './language.js'

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

// How much of a paragraph must be in a language for its voice to read the paragraph's English too
const PARAGRAPH_OWN_SHARE = 1 / 3

/**
 * Chunk sizes are set in English characters; languages that say more per
 * character (Japanese, Mandarin) get proportionally fewer, so every chunk
 * takes about the same time to voice and to hear.
 */
const sized = (chars: number, language: Lang) => Math.round((chars * CHARS_PER_SECOND[language]) / CHARS_PER_SECOND.en)

/** Breaks a very long sentence at clause punctuation so it fits a chunk */
function splitLong(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence]
  const parts: string[] = []
  let rest = sentence
  while (rest.length > max) {
    const window = rest.slice(0, max)
    const cut = Math.max(
      window.lastIndexOf(', '),
      window.lastIndexOf('; '),
      window.lastIndexOf(': '),
      window.lastIndexOf(' — '),
      window.lastIndexOf(', '),
      // Japanese, Chinese and Urdu clause marks, which have no space after them
      window.lastIndexOf('，'),
      window.lastIndexOf('、'),
      window.lastIndexOf('；'),
      window.lastIndexOf('،'),
    )
    const at = cut > max * 0.4 ? cut + 1 : window.lastIndexOf(' ') > 0 ? window.lastIndexOf(' ') : max
    parts.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

/**
 * A paragraph's sentences and who reads each. Within a paragraph one voice
 * reads wherever it can:
 * - English sentences beside Bangla, Urdu or Hindi ones are read by that
 *   language's voice, which says English too (see READS_ENGLISH), instead of
 *   an English voice cutting in for a sentence.
 * - A paragraph that's wholly English inside a Spanish (French, Italian…)
 *   document is read by an English voice, not sounded out as Spanish.
 */
function toSentences(paragraphs: string[], scripts: ScriptLanguages): Sentence[] {
  const out: Sentence[] = []
  for (const paragraph of paragraphs) {
    const english = isEnglishPassage(paragraph, scripts.latin)
    const own: Sentence[] = []
    let first = true
    for (const { segment } of segmenter.segment(paragraph)) {
      const max = sized(CHUNK_MAX_CHARS, detectLanguage(segment, scripts))
      for (const piece of splitLong(segment.trim(), max)) {
        if (!piece) continue
        own.push({ text: piece, language: english ? 'en' : detectLanguage(piece, scripts), paragraphStart: first })
        first = false
      }
    }
    // The paragraph's own voice, when it reads English too: the one with the most text. It takes the
    // paragraph's English sentences when a fair share of the paragraph is its own; one Bangla
    // phrase in a long English paragraph doesn't hand the whole paragraph to the Bangla voice.
    const share = new Map<Lang, number>()
    for (const s of own) if (READS_ENGLISH.includes(s.language)) share.set(s.language, (share.get(s.language) ?? 0) + s.text.length)
    const [reader, chars] = [...share.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    const absorbs = !!reader && (chars ?? 0) >= own.reduce((n, s) => n + s.text.length, 0) * PARAGRAPH_OWN_SHARE
    for (const s of own) out.push(absorbs && isLatinOnly(s.text) ? { ...s, language: reader } : s)
  }
  return out
}

/**
 * Groups sentences into speech chunks of a single language. The first chunk
 * is short so audio starts fast; later chunks prefer to end at paragraphs.
 * Latin-script sentences and Chinese characters take the document's languages
 * for them (`scripts`).
 */
export function chunkParagraphs(
  paragraphs: string[],
  scripts: ScriptLanguages = { latin: 'en', han: 'zh' },
  /** False for text edited into the middle of a document, where a quick start doesn't matter */
  { shortFirst = true }: { shortFirst?: boolean } = {},
): ChunkDraft[] {
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

  for (const sentence of toSentences(paragraphs, scripts)) {
    const size = current.reduce((n, s) => n + s.text.length + 1, 0)
    const language = current[0]?.language ?? sentence.language
    const target = sized(chunks.length === 0 && shortFirst ? FIRST_CHUNK_CHARS : CHUNK_TARGET_CHARS, language)
    const languageChanged = current.length > 0 && current[0].language !== sentence.language
    const wouldOverflow = size + sentence.text.length > sized(CHUNK_MAX_CHARS, language)
    const atParagraph = sentence.paragraphStart && size >= target * 0.6

    if (languageChanged || wouldOverflow || size >= target || atParagraph) flush()
    current.push(sentence)
  }
  flush()
  return chunks
}
