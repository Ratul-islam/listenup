/** One "say it like this" rule: `word` as written, `sayAs` spelled the way it sounds */
export interface PronunciationRule {
  word: string
  sayAs: string
}

/** A user's rules, ready to apply; empty when they have none */
export interface Lexicon {
  rules: PronunciationRule[]
  /** Changes whenever the rules do; part of every render key */
  key: string
  pattern: RegExp | null
}

export const EMPTY_LEXICON: Lexicon = { rules: [], key: '', pattern: null }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Letters, marks (Bangla and Hindi vowel signs) and digits make up words in every script
const WORD_CHAR = '[\\p{L}\\p{M}\\p{N}]'

export function buildLexicon(rules: PronunciationRule[]): Lexicon {
  const usable = rules.filter((r) => r.word.trim() && r.sayAs.trim())
  if (!usable.length) return EMPTY_LEXICON
  // Longest first, so "New York City" wins over "New York"
  const sorted = [...usable].sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word))
  const alternatives = sorted.map((r) => escape(r.word.trim()).replace(/\s+/g, '\\s+'))
  return {
    rules: sorted,
    key: JSON.stringify(sorted.map((r) => [r.word.trim().toLowerCase(), r.sayAs.trim()])),
    pattern: new RegExp(`(?<!${WORD_CHAR})(?:${alternatives.join('|')})(?!${WORD_CHAR})`, 'giu'),
  }
}

/** Where a replaced word went: [start, end) in the original text and in the spoken text */
interface Swap {
  from: number
  to: number
  newFrom: number
  newTo: number
}

/**
 * The text as it should be spoken, with a function that moves an offset in
 * the original text to the same place in the spoken text (an offset inside a
 * replaced word moves to that word's start, or its end for `end` offsets).
 */
export function pronounce(text: string, lexicon: Lexicon): { text: string; map: (offset: number, edge?: 'start' | 'end') => number } {
  if (!lexicon.pattern) return { text, map: (offset) => offset }
  const byWord = new Map(lexicon.rules.map((r) => [r.word.trim().toLowerCase().replace(/\s+/g, ' '), r.sayAs.trim()]))
  const swaps: Swap[] = []
  let out = ''
  let cursor = 0
  for (const match of text.matchAll(lexicon.pattern)) {
    const sayAs = byWord.get(match[0].toLowerCase().replace(/\s+/g, ' '))
    if (sayAs === undefined) continue
    out += text.slice(cursor, match.index)
    swaps.push({ from: match.index, to: match.index + match[0].length, newFrom: out.length, newTo: out.length + sayAs.length })
    out += sayAs
    cursor = match.index + match[0].length
  }
  if (!swaps.length) return { text, map: (offset) => offset }
  out += text.slice(cursor)

  const map = (offset: number, edge: 'start' | 'end' = 'start') => {
    let shift = 0
    for (const s of swaps) {
      if (offset <= s.from) break
      if (offset < s.to) return edge === 'end' ? s.newTo : s.newFrom
      shift = s.newTo - s.to
    }
    return offset + shift
  }
  return { text: out, map }
}
