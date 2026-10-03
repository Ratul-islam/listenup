import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import dns from 'node:dns/promises'
import net from 'node:net'
import { AppError } from '../../../utils/AppError.js'
import { htmlToParagraphs } from './html.js'
import type { Extracted } from './types.js'

const MAX_HTML_BYTES = 5 * 1024 * 1024

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./]

function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) return PRIVATE_V4.some((r) => r.test(address))
  const a = address.toLowerCase()
  return a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80') || a.startsWith('::ffff:127.')
}

/** Blocks requests to localhost/private networks (SSRF) */
async function assertPublicUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new AppError('Only http and https links are supported', 400, 'INVALID_URL')
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => [])
  if (!addresses.length) throw new AppError("That website couldn't be found", 400, 'URL_UNREACHABLE')
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new AppError('That link points to a private network', 400, 'INVALID_URL')
}

async function fetchHtml(start: URL) {
  let url = start
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicUrl(url)
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ListenUpReader/1.0)', Accept: 'text/html,application/xhtml+xml' },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, url)
      continue
    }
    if (!res.ok) throw new AppError(`The page returned an error (${res.status})`, 400, 'URL_UNREACHABLE')
    if (!/html/i.test(res.headers.get('content-type') ?? '')) {
      throw new AppError("That link isn't a web page. Download the file and import it instead.", 400, 'URL_NOT_HTML')
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_HTML_BYTES) throw new AppError('That page is too large to import', 400, 'URL_TOO_LARGE')
    return { html: buf.toString('utf8'), finalUrl: url }
  }
  throw new AppError('Too many redirects', 400, 'URL_UNREACHABLE')
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
