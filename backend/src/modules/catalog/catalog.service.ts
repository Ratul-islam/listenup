import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { CATALOG, findCatalogItem, type CatalogItem } from './catalog.data.js'
import type { CatalogRepository } from './catalog.repository.js'
import { fetchCatalogText, wikisourcePage } from './catalog.sources.js'

// Bump when the cleaning changes, so every title is fetched and cleaned again
const TEXT_VERSION = 1
const KEY = /^catalog\/v\d+\/([a-z0-9-]+)\.txt$/

/** Where a title's text is kept once fetched; one copy for everyone who adds it */
export const catalogTextKey = (id: string) => `catalog/v${TEXT_VERSION}/${id}.txt`

export const isCatalogKey = (key: string | null | undefined): key is string => !!key && KEY.test(key)

/**
 * A title's text from storage, or fetched from where it's published the first
 * time anyone adds it (Wikisource books can take half a minute), then kept.
 */
export async function catalogText(key: string) {
  try {
    return await storage.get(key)
  } catch (e) {
    // Storage itself failing isn't a reason to fetch the book again
    if (await storage.exists(key).catch(() => true)) throw e
    const item = findCatalogItem(KEY.exec(key)?.[1] ?? '')
    if (!item) throw new AppError('This title is no longer in Explore.', 422, 'CATALOG_ITEM_NOT_FOUND')
    const text = Buffer.from(await fetchCatalogText(item.source), 'utf8')
    await storage.put(key, text, 'text/plain; charset=utf-8')
    return text
  }
}

/** Where a title comes from, for its credit line and link */
export function sourceOf({ source }: CatalogItem) {
  return source.site === 'gutenberg'
    ? { name: 'Project Gutenberg', url: `https://www.gutenberg.org/ebooks/${source.id}` }
    : { name: 'Wikisource', url: wikisourcePage(source.lang, source.page) }
}

/** Explore's free classics, and which of them the listener has already added */
export class CatalogService {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  async list(userId: string) {
    const added = new Map((await this.catalogRepository.findAdded(userId, CATALOG.map((i) => catalogTextKey(i.id)))).map((d) => [d.fileKey, d]))
    return CATALOG.map((item) => {
      const doc = added.get(catalogTextKey(item.id))
      return {
        id: item.id,
        title: item.title,
        englishTitle: item.englishTitle ?? null,
        author: item.author,
        language: item.language,
        blurb: item.blurb,
        minutes: item.minutes,
        source: sourceOf(item),
        /** On the listener's shelf already: open it instead of adding it again */
        documentId: doc?.id ?? null,
        status: doc?.status ?? null,
      }
    })
  }
}
