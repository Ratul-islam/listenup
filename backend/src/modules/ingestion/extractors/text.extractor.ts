import { splitParagraphs, stripMarkdown } from '../text/normalize.js'
import type { Extracted } from './types.js'

export function extractPlainText(buffer: Buffer, markdown: boolean): Extracted {
  const raw = buffer.toString('utf8')
  const text = markdown ? stripMarkdown(raw) : raw
  const paragraphs = splitParagraphs(text)
  // A Markdown "# Title" line makes a good document title
  const heading = markdown ? /^\s{0,3}#\s+(.+)$/m.exec(raw)?.[1]?.trim() : undefined
  return { title: heading, paragraphs }
}
