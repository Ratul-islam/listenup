import { parse, type HTMLElement } from 'node-html-parser'
import { AppError } from '../../utils/AppError.js'
import { htmlToParagraphs } from '../ingestion/extractors/html.js'
import type { CatalogSource } from './catalog.data.js'

const USER_AGENT = 'ListenUp/1.0 (free classics catalog; fetches each title once)'
const FETCH_TIMEOUT_MS = 30_000
// Between Wikisource pages of one book, to be gentle with a volunteer-run site
const PAGE_GAP_MS = 150

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Couldn't reach the source: a retry later may work, so the import job tries again */
const unreachable = (site: string) => new AppError(`Couldn't get this title from ${site} right now. Try again in a little while.`, 503, 'PROVIDER_ERROR')

async function fetchText(url: string, site: string) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).catch(() => {
    throw unreachable(site)
  })
  if (!res.ok) throw res.status >= 500 || res.status === 429 ? unreachable(site) : new AppError(`${site} doesn't have this title any more.`, 422, 'CATALOG_SOURCE_GONE')
  return res.text().catch(() => {
    throw unreachable(site)
  })
}

// ---- Project Gutenberg ----

/** The line number of the `nth` line that reads exactly `line` (trimmed), or -1 */
function findLine(lines: string[], line: string, nth = 1, after = 0) {
  for (let i = after, seen = 0; i < lines.length; i++) {
    if (lines[i].trim() === line && ++seen === nth) return i
  }
  return -1
}

/**
 * A Project Gutenberg plain-text book as readable text: without the licence
 * header and footer, contents pages and prefaces (`from`), anything after
 * the part wanted (`to`), illustration captions and _italic_ marks.
 */
export function cleanGutenberg(raw: string, { from, fromNth = 1, to }: Extract<CatalogSource, { site: 'gutenberg' }>) {
  let lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const start = lines.findIndex((l) => /^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK/i.test(l))
  const end = lines.findIndex((l) => /^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK/i.test(l))
  if (start < 0) throw new AppError("This title's text isn't in the expected form.", 422, 'CATALOG_SOURCE_GONE')
  lines = lines.slice(start + 1, end > start ? end : undefined)
  if (from) {
    const at = findLine(lines, from, fromNth)
    if (at < 0) throw new AppError("This title's text isn't in the expected form.", 422, 'CATALOG_SOURCE_GONE')
    lines = lines.slice(at)
  }
  if (to) {
    const at = findLine(lines, to, 1, 1)
    if (at > 0) lines = lines.slice(0, at)
  }
  return lines
    .join('\n')
    .replace(/\[(Illustration|Picture)[^\]]*\]/g, '')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function fromGutenberg(source: Extract<CatalogSource, { site: 'gutenberg' }>) {
  const raw = await fetchText(`https://www.gutenberg.org/cache/epub/${source.id}/pg${source.id}.txt`, 'Project Gutenberg')
  return cleanGutenberg(raw, source)
}

// ---- Wikisource ----

// Page furniture: the title box, page numbers, edit links and footnotes aren't read aloud
const FURNITURE = [
  'style',
  'link',
  '.ws-noexport',
  '.noprint',
  '.pagenum',
  '.ws-pagenum',
  '.headertemplate',
  '#headertemplate',
  '.wikisource-header-template',
  'sup.reference',
  '.reference',
  '.references',
  '.mw-references-wrap',
  '.mw-editsection',
].join(', ')

/**
 * One rendered Wikisource page as paragraphs. Each line of a poem becomes its
 * own paragraph, so it's read as a line and not run into the next.
 */
export function cleanWikisource(html: string) {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } })
  for (const el of root.querySelectorAll(FURNITURE)) el.remove()
  for (const poem of root.querySelectorAll('.poem')) {
    const lines = poem.innerHTML.split(/<br\s*\/?>/i).map((l) => `<p>${l}</p>`)
    ;(poem as HTMLElement).set_content(lines.join(''))
  }
  return htmlToParagraphs(root.toString()).filter((p) => p.trim().length > 0)
}

const wikisourceUrl = (lang: string, page: string, query: Record<string, string> = {}) =>
  `https://${lang}.wikisource.org/w/index.php?${new URLSearchParams({ title: page, ...query })}`

/** The public page for a title, as its credit link */
export const wikisourcePage = (lang: string, page: string) => `https://${lang}.wikisource.org/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}`

/** Links on a rendered page to its own subpages (chapters), in reading order */
export function subpagesOf(html: string, lang: string, page: string) {
  const found: string[] = []
  for (const [, href] of html.matchAll(new RegExp(`href="(?:https:)?//${lang}\\.wikisource\\.org/wiki/([^"#?]+)"`, 'g'))) {
    const title = decodeURIComponent(href).replace(/_/g, ' ')
    if (title.startsWith(`${page}/`) && !found.includes(title)) found.push(title)
  }
  return found
}

/** Paragraphs without one said twice in a row (a page's title box and its heading often repeat the title) */
const withoutRepeats = (paragraphs: string[]) => paragraphs.filter((p, i) => p !== paragraphs[i - 1])

async function fromWikisource({ lang, page, chapters }: Extract<CatalogSource, { site: 'wikisource' }>) {
  const render = (title: string) => fetchText(wikisourceUrl(lang, title, { action: 'render' }), 'Wikisource')
  const main = await render(page)
  if (!chapters) return withoutRepeats(cleanWikisource(main)).join('\n\n')

  // Each chapter page starts with its own heading ("এক", "প্রথম পরিচ্ছেদ।", a poem's title)
  const paragraphs: string[] = []
  for (const title of subpagesOf(main, lang, page)) {
    await sleep(PAGE_GAP_MS)
    paragraphs.push(...cleanWikisource(await render(title)))
  }
  if (!paragraphs.length) throw new AppError("This title's chapters couldn't be found.", 422, 'CATALOG_SOURCE_GONE')
  return withoutRepeats(paragraphs).join('\n\n')
}

/** A title's full text, fetched from where it's published */
export function fetchCatalogText(source: CatalogSource) {
  return source.site === 'gutenberg' ? fromGutenberg(source) : fromWikisource(source)
}
