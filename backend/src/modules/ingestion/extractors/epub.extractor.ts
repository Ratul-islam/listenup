import { parse } from 'node-html-parser'
import path from 'node:path'
import { MAX_DOCUMENT_CHARS } from '../../../config/constants.js'
import { openZip } from '../../../lib/zip.js'
import { htmlToParagraphs } from './html.js'
import type { Extracted } from './types.js'

// Generous for a whole book's chapters; a file that claims more is refused, not unpacked
const EPUB_LIMITS = { maxEntries: 10_000, maxEntryBytes: 24 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024 }

const decodeHref = (href: string) => {
  try {
    return decodeURIComponent(href)
  } catch {
    return href
  }
}

/** EPUB → paragraphs in spine (reading) order, with title/author from the OPF */
export async function extractEpub(buffer: Buffer): Promise<Extracted> {
  const zip = openZip(buffer, EPUB_LIMITS)
  const container = zip.read('META-INF/container.xml')?.toString('utf8')
  const opfPath = container && parse(container).querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) throw new Error('Not a valid EPUB (missing package file)')

  const opf = parse(zip.read(opfPath)?.toString('utf8') ?? '')
  const baseDir = path.posix.dirname(opfPath)
  const manifest = new Map(
    opf.querySelectorAll('manifest item').map((item) => [item.getAttribute('id'), item.getAttribute('href')]),
  )
  const spine = opf.querySelectorAll('spine itemref').map((ref) => manifest.get(ref.getAttribute('idref')))

  const paragraphs: string[] = []
  let chars = 0
  for (const href of spine) {
    if (!href) continue
    const file = zip.read(path.posix.join(baseDir, decodeHref(href)))
    if (!file) continue
    const html = file.toString('utf8')
    const body = parse(html).querySelector('body')?.innerHTML ?? html
    for (const p of htmlToParagraphs(body)) {
      paragraphs.push(p)
      chars += p.length
    }
    // Text past the document limit is cut anyway: stop unpacking chapters
    if (chars > MAX_DOCUMENT_CHARS) break
  }

  return {
    title: opf.querySelector('dc\\:title, title')?.textContent.trim() || undefined,
    author: opf.querySelector('dc\\:creator, creator')?.textContent.trim() || undefined,
    paragraphs,
  }
}
