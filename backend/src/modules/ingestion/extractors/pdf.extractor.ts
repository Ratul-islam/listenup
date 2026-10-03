import { extractTextItems, getDocumentProxy, getMeta } from 'unpdf'
import type { Extracted } from './types.js'

// Pre-Unicode Bangla fonts (Bijoy keyboard family) extract as Latin gibberish
const LEGACY_BANGLA_FONT = /(sutonny|bijoy|mj\b|mj[-_ ]|\bmj$|kalpurushansi|siyamrupali_ansi)/i
const MIN_CHARS_PER_PAGE = 40
const SENTENCE_END = /[.!?।:"”)]\s*$/

interface Line {
  text: string
  y: number
  height: number
  fontSize: number
}

const median = (values: number[]) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const signature = (line: string) => line.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

/** Text-based PDF → paragraphs, dropping running headers, footers and page numbers */
export async function extractPdf(buffer: Buffer): Promise<Extracted> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const [{ info }, { items, totalPages }] = await Promise.all([getMeta(pdf), extractTextItems(pdf)])

  let totalChars = 0
  let legacyChars = 0
  const pages: Line[][] = items.map((pageItems) => {
    const lines: Line[] = []
    let current: Line | null = null
    for (const item of pageItems) {
      totalChars += item.str.length
      if (LEGACY_BANGLA_FONT.test(item.fontFamily)) legacyChars += item.str.length
      if (!current || Math.abs(current.y - item.y) > Math.max(2, item.height * 0.5)) {
        if (current?.text.trim()) lines.push(current)
        current = { text: item.str, y: item.y, height: item.height || item.fontSize, fontSize: item.fontSize }
      } else {
        current.text += item.str
      }
      if (item.hasEOL && current) {
        if (current.text.trim()) lines.push(current)
        current = null
      }
    }
    if (current?.text.trim()) lines.push(current)
    return lines
  })

  const needsOcr = totalChars / Math.max(totalPages, 1) < MIN_CHARS_PER_PAGE || legacyChars / Math.max(totalChars, 1) > 0.2
  const title = typeof info?.Title === 'string' && info.Title.trim() ? info.Title.trim() : undefined
  const author = typeof info?.Author === 'string' && info.Author.trim() ? info.Author.trim() : undefined
  if (needsOcr) return { title, author, paragraphs: [], needsOcr: true }

  const gapsOf = (lines: Line[]) => lines.slice(1).map((l, i) => Math.abs(lines[i].y - l.y))
  const pageGap = pages.map((lines) => median(gapsOf(lines)) || 14)

  // Header/footer candidates sit in the page margin: first/last line, set apart by a big gap
  const margins = pages.map((lines, p) => {
    const set = new Set<Line>()
    if (lines.length > 2 && Math.abs(lines[0].y - lines[1].y) > pageGap[p] * 1.5) set.add(lines[0])
    const last = lines.length - 1
    if (lines.length > 2 && Math.abs(lines[last - 1].y - lines[last].y) > pageGap[p] * 1.5) set.add(lines[last])
    return set
  })
  const marginCounts = new Map<string, number>()
  for (const set of margins) for (const line of set) marginCounts.set(signature(line.text), (marginCounts.get(signature(line.text)) ?? 0) + 1)

  const isRunning = (line: Line) =>
    /^\s*(page\s*)?[\divxlc]+(\s*(of|\/)\s*\d+)?\s*$/i.test(line.text) ||
    (totalPages >= 3 && (marginCounts.get(signature(line.text)) ?? 0) >= Math.max(2, totalPages * 0.4))

  const paragraphs: string[] = []
  let paragraph = ''
  pages.forEach((lines, p) => {
    const kept = lines.filter((l) => !(margins[p].has(l) && isRunning(l)))
    const lineGap = median(gapsOf(kept)) || pageGap[p]
    const lineLength = median(kept.map((l) => l.text.length)) || 60

    kept.forEach((line, i) => {
      const prev = kept[i - 1]
      const bigGap = prev && Math.abs(prev.y - line.y) > lineGap * 1.6
      const prevEndedShort = prev && prev.text.trim().length < lineLength * 0.7 && SENTENCE_END.test(prev.text)
      // Across a page break there is no gap to measure; a finished sentence is the best signal
      const newPage = i === 0 && SENTENCE_END.test(paragraph)
      if (paragraph && (bigGap || prevEndedShort || newPage)) {
        paragraphs.push(paragraph)
        paragraph = ''
      }
      paragraph += (paragraph ? '\n' : '') + line.text.trim()
    })
  })
  if (paragraph) paragraphs.push(paragraph)

  return { title, author, paragraphs }
}
