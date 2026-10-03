import JSZip from 'jszip'
import { parse } from 'node-html-parser'
import path from 'node:path'
import { htmlToParagraphs } from './html.js'
import type { Extracted } from './types.js'

/** EPUB → paragraphs in spine (reading) order, with title/author from the OPF */
export async function extractEpub(buffer: Buffer): Promise<Extracted> {
  const zip = await JSZip.loadAsync(buffer)
  const container = await zip.file('META-INF/container.xml')?.async('string')
  const opfPath = container && parse(container).querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) throw new Error('Not a valid EPUB (missing package file)')

  const opf = parse((await zip.file(opfPath)?.async('string')) ?? '')
  const baseDir = path.posix.dirname(opfPath)
  const manifest = new Map(
    opf.querySelectorAll('manifest item').map((item) => [item.getAttribute('id'), item.getAttribute('href')]),
  )
  const spine = opf.querySelectorAll('spine itemref').map((ref) => manifest.get(ref.getAttribute('idref')))

  const paragraphs: string[] = []
  for (const href of spine) {
    if (!href) continue
    const file = zip.file(path.posix.join(baseDir, decodeURIComponent(href)))
    if (!file) continue
    const html = await file.async('string')
    const body = parse(html).querySelector('body')?.innerHTML ?? html
    paragraphs.push(...htmlToParagraphs(body))
  }

  return {
    title: opf.querySelector('dc\\:title, title')?.textContent.trim() || undefined,
    author: opf.querySelector('dc\\:creator, creator')?.textContent.trim() || undefined,
    paragraphs,
  }
}
