import { MAX_DOCUMENT_CHARS } from '../../config/constants.js'
import { partDelivery, readStudio } from '../studio/studio-catalog.js'
import type { Document } from '../../generated/prisma/client.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { catalogText, isCatalogKey } from '../catalog/catalog.service.js'
import type { DocumentsRepository } from '../documents/documents.repository.js'
import type { UsageService } from '../usage/usage.service.js'
import { extractArchive } from './extractors/archive.js'
import { ocrImage, ocrPdf } from './extractors/ocr.extractor.js'
import { extractPdfIsolated, pdfPageCountIsolated, splitPdfIsolated } from './extractors/pdf-process.js'
import { extractPlainText } from './extractors/text.extractor.js'
import type { Extracted } from './extractors/types.js'
import { extractWeb } from './extractors/web.extractor.js'
import { chunkParagraphs } from './text/chunker.js'
import { removeClutter } from './text/clutter.js'
import { documentLanguage, documentScripts } from './text/language.js'
import { makeExcerpt, normalizeParagraphs } from './text/normalize.js'

// Errors worth retrying (provider hiccups, network) vs. problems with the file itself
const isTransient = (e: unknown) =>
  e instanceof AppError ? ['PROVIDER_ERROR', 'PROVIDER_NOT_CONFIGURED'].includes(e.code ?? '') && e.statusCode >= 500 : !(e instanceof Error && /invalid|corrupt|password|encrypted/i.test(e.message))

/** Turns an imported source (file, link or pasted text) into speech-ready chunks */
export class IngestionService {
  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly usageService: UsageService,
  ) {}

  private async extract(doc: Document, forceOcr: boolean): Promise<{ extracted: Extracted; usedOcr: boolean }> {
    // A translation or a free classic keeps a shelf kind (a book) but its text is plain.
    // A classic's text is shared, and fetched from where it's published the first time.
    if (doc.translatedFromId || (doc.kind !== 'TEXT' && doc.mimeType === 'text/plain')) {
      const file = isCatalogKey(doc.fileKey) ? await catalogText(doc.fileKey) : await storage.get(doc.fileKey!)
      return { extracted: extractPlainText(file, false), usedOcr: false }
    }
    if (doc.kind === 'WEB') return { extracted: await extractWeb(doc.sourceUrl!), usedOcr: false }

    const file = await storage.get(doc.fileKey!)
    switch (doc.kind) {
      case 'PDF': {
        const text = forceOcr ? { paragraphs: [], needsOcr: true } : await extractPdfIsolated(file)
        if (!text.needsOcr) return { extracted: text, usedOcr: false }
        // Free reads a few hundred pages a month with OCR; a file that doesn't fit isn't started
        const pages = await pdfPageCountIsolated(file)
        await this.usageService.assertOcrPages(doc.userId, pages)
        const ocr = await ocrPdf(await splitPdfIsolated(file), doc.userId)
        await this.usageService.recordOcrPages(doc.userId, pages)
        return { extracted: { ...text, paragraphs: ocr.paragraphs, needsOcr: false }, usedOcr: true }
      }
      case 'IMAGE': {
        await this.usageService.assertOcrPages(doc.userId, 1)
        const extracted = await ocrImage(file, doc.mimeType ?? 'image/jpeg', doc.userId)
        await this.usageService.recordOcrPages(doc.userId, 1)
        return { extracted, usedOcr: true }
      }
      case 'DOCX':
      case 'EPUB':
        return { extracted: await extractArchive(doc.kind, file), usedOcr: false }
      case 'MARKDOWN':
        return { extracted: extractPlainText(file, true), usedOcr: false }
      case 'TEXT':
        return { extracted: extractPlainText(file, false), usedOcr: false }
    }
  }

  /**
   * Runs one processing attempt. Returns normally when done (READY or a
   * permanent FAILED); throws when a retry might succeed.
   */
  async process(documentId: string, { forceOcr = false, finalAttempt = true } = {}) {
    const doc = await this.documentsRepository.findById(documentId)
    if (!doc) return

    await this.documentsRepository.update(doc.id, { status: 'PROCESSING', error: null })
    try {
      const { extracted, usedOcr } = await this.extract(doc, forceOcr)
      let paragraphs = normalizeParagraphs(extracted.paragraphs)
      if (!doc.keepClutter) paragraphs = removeClutter(paragraphs)

      let total = 0
      paragraphs = paragraphs.filter((p) => (total += p.length) <= MAX_DOCUMENT_CHARS)
      if (!paragraphs.length) {
        throw new AppError(
          usedOcr ? "We couldn't find any readable text in this file." : 'This file has no readable text. Try importing it as a scan.',
          422,
          'NO_TEXT',
        )
      }

      const chunks = chunkParagraphs(paragraphs, documentScripts(paragraphs, doc.languageHint))
      const charCount = chunks.reduce((n, c) => n + c.text.length, 0)

      await this.documentsRepository.replaceChunks(doc.id, chunks, {
        status: 'READY',
        error: null,
        title: chooseTitle(doc, extracted.title, paragraphs[0]),
        author: extracted.author ?? doc.author,
        language: documentLanguage(chunks),
        excerpt: makeExcerpt(paragraphs),
        charCount,
        chunkCount: chunks.length,
        estimatedDurationSec: Math.round(chunks.reduce((s, c) => s + c.estimatedDurationSec, 0)),
        usedOcr,
      }, partDelivery(readStudio(doc.studio)))
    } catch (e) {
      if (!finalAttempt && isTransient(e)) {
        await this.documentsRepository.update(doc.id, { status: 'PENDING' })
        throw e
      }
      console.error(`[ingestion] ${doc.id} failed`, e)
      await this.documentsRepository.update(doc.id, {
        status: 'FAILED',
        error: e instanceof AppError ? e.message : "We couldn't read this file. Check it opens on your phone and try again.",
      })
    }
  }
}

export const UNTITLED = 'Untitled note'

// PDF metadata titles are often leftovers like "Microsoft Word - draft3.docx"
const JUNK_TITLE = /microsoft|\.(docx?|pdf|indd|tex)\b|^untitled|^document\d*$/i

/** Best available title: embedded metadata, then filename, then the opening words */
function chooseTitle(doc: Document, extracted: string | undefined, firstParagraph: string) {
  if (doc.kind === 'TEXT' && doc.title === UNTITLED) return titleFrom(firstParagraph)
  if (extracted && !JUNK_TITLE.test(extracted) && doc.kind !== 'TEXT') return extracted.slice(0, 200)
  return doc.title
}

/** First words of a pasted note as its title */
function titleFrom(paragraph: string) {
  const firstSentence = paragraph.split(/(?<=[.!?।])\s/)[0]
  return firstSentence.length <= 60 ? firstSentence : `${firstSentence.slice(0, 57).replace(/\s+\S*$/, '')}…`
}
