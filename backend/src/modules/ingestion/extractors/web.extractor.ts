import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { fetchPublic } from '../../../lib/public-fetch.js'
import { AppError } from '../../../utils/AppError.js'
import { htmlToParagraphs } from './html.js'
import type { Extracted } from './types.js'

const MAX_HTML_BYTES = 5 * 1024 * 1024

async function fetchHtml(start: URL) {
  const res = await fetchPublic(start, {
    accept: 'text/html,application/xhtml+xml',
    maxBytes: MAX_HTML_BYTES,
    timeoutMs: 20_000,
    userAgent: 'Mozilla/5.0 (compatible; ListenUpReader/1.0)',
  })
  if (res.status < 200 || res.status >= 300) {
    res.discard()
    throw new AppError(`The page returned an error (${res.status})`, 400, 'URL_UNREACHABLE')
  }
  if (!/html/i.test(res.contentType)) {
    res.discard()
    throw new AppError("That link isn't a web page. Download the file and import it instead.", 400, 'URL_NOT_HTML')
  }
  return { html: (await res.body()).toString('utf8'), finalUrl: res.finalUrl }
}

/** Web article → title, byline and the main story text */
export async function extractWeb(rawUrl: string): Promise<Extracted & { siteName?: string }> {
  const { html, finalUrl } = await fetchHtml(new URL(rawUrl))
  const { document } = parseHTML(html)
  const article = new Readability(document as unknown as Document).parse()
  if (!article?.content) throw new AppError("Couldn't find an article on that page", 422, 'NO_ARTICLE')

  return {
    title: article.title?.trim() || finalUrl.hostname,
    author: article.byline?.trim() || article.siteName?.trim() || finalUrl.hostname.replace(/^www\./, ''),
    siteName: article.siteName ?? finalUrl.hostname.replace(/^www\./, ''),
    paragraphs: htmlToParagraphs(article.content),
  }
}
