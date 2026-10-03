import { parse, type HTMLElement } from 'node-html-parser'

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption, dd, dt, td'

/** Readable paragraphs from an HTML fragment, in document order */
export function htmlToParagraphs(html: string): string[] {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } })
  const blocks = root.querySelectorAll(BLOCKS)
  // Leaf blocks only, so nested <li><p> isn't read twice
  const leaves = blocks.filter((el: HTMLElement) => !el.querySelector(BLOCKS))
  const paragraphs = leaves.map((el) => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)
  return paragraphs.length ? paragraphs : [root.textContent.replace(/\s+/g, ' ').trim()]
}
