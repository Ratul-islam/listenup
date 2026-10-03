import { MAX_DOCUMENT_CHARS } from '../../config/constants.js'
import type { Document } from '../../generated/prisma/client.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import type { DocumentsRepository } from '../documents/documents.repository.js'
import { extractDocx } from './extractors/docx.extractor.js'
import { extractEpub } from './extractors/epub.extractor.js'
import { ocrImage, ocrPdf } from './extractors/ocr.extractor.js'
import { extractPdf } from './extractors/pdf.extractor.js'
import { extractPlainText } from './extractors/text.extractor.js'
import type { Extracted } from './extractors/types.js'
import { extractWeb } from './extractors/web.extractor.js'
import { chunkParagraphs } from './text/chunker.js'
import { documentLanguage } from './text/language.js'
import { makeExcerpt, normalizeParagraphs } from './text/normalize.js'

// Errors worth retrying (provider hiccups, network) vs. problems with the file itself
const isTransient = (e: unknown) =>
  e instanceof AppError ? ['PROVIDER_ERROR', 'PROVIDER_NOT_CONFIGURED'].includes(e.code ?? '') && e.statusCode >= 500 : !(e instanceof Error && /invalid|corrupt|password|encrypted/i.test(e.message))

/** Turns an imported source (file, link or pasted text) into speech-ready chunks */
export class IngestionService {
  constructor(private readonly documentsRepository: DocumentsRepository) {}

  private async extract(doc: Document, forceOcr: boolean): Promise<{ extracted: Extracted; usedOcr: boolean }> {
    if (doc.kind === 'WEB') return { extracted: await extractWeb(doc.sourceUrl!), usedOcr: false }

    const file = await storage.get(doc.fileKey!)
    switch (doc.kind) {
      case 'PDF': {
        const text = forceOcr ? { paragraphs: [], needsOcr: true } : await extractPdf(file)
        if (!text.needsOcr) return { extracted: text, usedOcr: false }
        const ocr = await ocrPdf(file)
        return { extracted: { ...text, paragraphs: ocr.paragraphs, needsOcr: false }, usedOcr: true }
      }
      case 'IMAGE':
        return { extracted: await ocrImage(file, doc.mimeType ?? 'image/jpeg'), usedOcr: true }
      case 'DOCX':
        return { extracted: await extractDocx(file), usedOcr: false }
      case 'EPUB':
        return { extracted: await extractEpub(file), usedOcr: false }
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

      let total = 0
      paragraphs = paragraphs.filter((p) => (total += p.length) <= MAX_DOCUMENT_CHARS)
      if (!paragraphs.length) {
        throw new AppError(
          usedOcr ? "We couldn't find any readable text in this file." : 'This file has no readable text. Try importing it as a scan.',
          422,
          'NO_TEXT',
        )
      }

      const chunks = chunkParagraphs(paragraphs)
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
      })
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
