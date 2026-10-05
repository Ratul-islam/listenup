import { env } from '../../config/env.js'
import type { DocumentChunk } from '../../generated/prisma/client.js'
import { chatCompletion } from '../../lib/openrouter.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import type { DocumentsRepository } from '../documents/documents.repository.js'
import type { UsageService } from '../usage/usage.service.js'
import type { IngestionService } from './ingestion.service.js'
import type { SentenceSpan } from './text/chunker.js'
import type { Lang } from './text/language.js'

// Characters sent per request; the model gets whole paragraphs and returns them in order
const BATCH_CHARS = 4000
const CONCURRENCY = 3

const TARGET_NAMES: Record<Lang, string> = {
  en: 'English',
  bn: 'Bangla (Bengali, as written in Bangladesh)',
  hi: 'Hindi',
  es: 'Spanish (neutral Latin American)',
  pt: 'Brazilian Portuguese',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  zh: 'Mandarin Chinese, in Simplified characters',
  ur: 'Urdu, in Nastaliq/Perso-Arabic script',
  id: 'Indonesian',
}

/** A document's paragraphs, rebuilt from its chunks' sentence spans */
function paragraphsOf(chunks: DocumentChunk[]) {
  const paragraphs: string[] = []
  for (const chunk of chunks) {
    for (const s of chunk.sentences as unknown as SentenceSpan[]) {
      const sentence = chunk.text.slice(s.start, s.end).trim()
      if (!sentence) continue
      if (s.paragraphStart || !paragraphs.length) paragraphs.push(sentence)
      else paragraphs[paragraphs.length - 1] += ` ${sentence}`
    }
  }
  return paragraphs
}

/** Paragraphs grouped into requests of about BATCH_CHARS (a longer paragraph goes alone) */
function batchesOf(paragraphs: string[]) {
  const batches: string[][] = []
  let current: string[] = []
  let size = 0
  for (const p of paragraphs) {
    if (current.length && size + p.length > BATCH_CHARS) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(p)
    size += p.length
  }
  if (current.length) batches.push(current)
  return batches
}

/**
 * "Translate": turns a document into another language as a new document. The
 * paragraphs are translated by a text model, saved as the new document's text,
 * and then imported like pasted text, so it gets chunks, voices and emotions.
 */
export class TranslationService {
  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly ingestionService: IngestionService,
    private readonly usageService: UsageService,
  ) {}

  private async translateBatch(items: string[], language: Lang): Promise<string[]> {
    const reply = await chatCompletion({
      model: env.OPENROUTER_TEXT_MODEL,
      system:
        `You translate documents that will be read aloud. Translate every string in "items" into ${TARGET_NAMES[language]}. ` +
        'Keep the meaning, tone, names and numbers. Do not add, merge, split, summarise or drop items, and do not add notes. ' +
        `Reply as JSON: {"items": [...]} with exactly ${items.length} strings, in the same order.`,
      content: [{ type: 'text', text: JSON.stringify({ items }) }],
      json: true,
      purpose: 'translation',
    })
    let parsed: unknown
    try {
      parsed = (JSON.parse(reply) as { items?: unknown }).items
    } catch {
      parsed = null
    }
    if (Array.isArray(parsed) && parsed.length === items.length && parsed.every((t) => typeof t === 'string')) return parsed as string[]

    // The model lost count: halve the batch until each part comes back whole
    if (items.length > 1) {
      const half = Math.ceil(items.length / 2)
      return [...(await this.translateBatch(items.slice(0, half), language)), ...(await this.translateBatch(items.slice(half), language))]
    }
    throw new AppError("Couldn't translate part of this document.", 502, 'PROVIDER_ERROR')
  }

  /** Job body. Throws to retry; on the final attempt the document is marked failed instead. */
  async run(documentId: string, sourceId: string, language: Lang, { finalAttempt = true } = {}) {
    const doc = await this.documentsRepository.findById(documentId)
    if (!doc) return
    try {
      await this.documentsRepository.update(documentId, { status: 'PROCESSING', error: null })
      const chunks = await this.documentsRepository.listChunks(sourceId)
      if (!chunks.length) throw new AppError('The original document is gone.', 404, 'DOCUMENT_NOT_FOUND')

      const batches = batchesOf(paragraphsOf(chunks))
      const translated: string[][] = new Array(batches.length)
      let next = 0
      const worker = async () => {
        while (next < batches.length) {
          const i = next++
          translated[i] = await this.translateBatch(batches[i], language)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker))

      const text = translated.flat().join('\n\n')
      const fileKey = `documents/${doc.userId}/${doc.id}/source.txt`
      await storage.put(fileKey, Buffer.from(text, 'utf8'), 'text/plain')
      await this.documentsRepository.update(documentId, { fileKey })
      await this.usageService.recordTranslation(doc.userId, chunks.reduce((n, c) => n + c.text.length, 0))

      // Now it's ordinary text: chunk it, detect languages, get it ready to play
      await this.ingestionService.process(documentId)
    } catch (e) {
      if (!finalAttempt) {
        await this.documentsRepository.update(documentId, { status: 'PENDING' })
        throw e
      }
      console.error(`[translation] ${documentId} failed`, e)
      await this.documentsRepository.update(documentId, {
        status: 'FAILED',
        error: e instanceof AppError && e.statusCode < 500 ? e.message : "Couldn't translate this document. Try again in a little while.",
      })
    }
  }
}
