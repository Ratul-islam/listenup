/** A quoted stretch of text, marks included: [start, end) */
export interface QuoteSpan {
  start: number
  end: number
}

// Opening mark → the marks that close it
const PAIRS: Record<string, string> = { '“': '”', '„': '“”', '«': '»', '‹': '›', '「': '」', '『': '』', '‘': '’', '"': '"' }
const LETTER = /[\p{L}\p{N}]/u

/**
 * The quoted speech in a passage: “…”, "…", «…», ‘…’ and the East Asian
 * brackets. A ’ inside a word (don’t) is an apostrophe, not the end of a
 * quote; a ‘ counts only at the start of a word. Speech still open at the end
 * runs to the end, since it carries on in the next part.
 */
export function quoteSpans(text: string): QuoteSpan[] {
  const spans: QuoteSpan[] = []
  let open: { at: number; closers: string } | null = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (open) {
      if (!open.closers.includes(ch)) continue
      if (ch === '’' && LETTER.test(text[i + 1] ?? '')) continue
      spans.push({ start: open.at, end: i + 1 })
      open = null
    } else if (ch in PAIRS) {
      if (ch === '‘' && LETTER.test(text[i - 1] ?? '')) continue
      open = { at: i, closers: PAIRS[ch] }
    }
  }
  if (open) spans.push({ start: open.at, end: text.length })
  return spans
}
