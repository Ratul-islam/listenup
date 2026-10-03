import path from 'node:path'
import { ALLOWED_UPLOADS } from '../../config/constants.js'
import type { Document, DocumentChunk, PlaybackState } from '../../generated/prisma/client.js'
import { queue, QUEUES, startQueue, type ProcessDocumentJob } from '../../lib/queue.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { UNTITLED } from '../ingestion/ingestion.service.js'
import type { Lang } from '../ingestion/text/language.js'
import { readExpressions } from '../expressions/expression-catalog.js'
import { planFor } from '../tts/tts.service.js'
import type { VoicesService } from '../voices/voices.service.js'
import { CATEGORY_KINDS, type DocumentsRepository } from './documents.repository.js'
import type { ListQuery, TextBody, UpdateBody, UrlBody } from './documents.schema.js'

type WithPlayback = Document & { playback?: PlaybackState[] }

/** Client-facing document card data */
export function toSummary(doc: WithPlayback) {
  const state = doc.playback?.[0]
  const fraction = state?.completedAt ? 1 : state && doc.chunkCount ? Math.min(state.chunkIndex / doc.chunkCount, 1) : 0
  return {
    id: doc.id,
    title: doc.title,
    author: doc.author,
    kind: doc.kind,
    status: doc.status,
    error: doc.error,
    folderId: doc.folderId,
    sourceUrl: doc.sourceUrl,
    fileName: doc.fileName,
    language: doc.language,
    excerpt: doc.excerpt,
    charCount: doc.charCount,
    chunkCount: doc.chunkCount,
    estimatedDurationSec: doc.estimatedDurationSec,
    usedOcr: doc.usedOcr,
    autoExpression: doc.autoExpression,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    progress: state
      ? {
          chunkIndex: state.chunkIndex,
          offsetMs: state.offsetMs,
          voiceId: state.voiceId,
          speed: state.speed,
          fraction,
          completedAt: state.completedAt,
          updatedAt: state.updatedAt,
        }
      : null,
  }
}

const sourceKey = (userId: string, documentId: string, ext: string) => `documents/${userId}/${documentId}/source.${ext}`

export class DocumentsService {
  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly voicesService: VoicesService,
  ) {}

  private async enqueue(job: ProcessDocumentJob) {
    await startQueue()
    await queue.send(QUEUES.processDocument, job)
  }

  private async owned(userId: string, id: string) {
    const doc = await this.documentsRepository.findOwned(userId, id)
    if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
    return doc
  }

  async list(userId: string, query: ListQuery) {
    const [docs, counts] = await Promise.all([
      this.documentsRepository.list(userId, query),
      this.documentsRepository.countByKind(userId),
    ])
    const byKind = Object.fromEntries(counts.map((c) => [c.kind, c._count._all])) as Record<string, number>
    const sum = (kinds: string[]) => kinds.reduce((n, k) => n + (byKind[k] ?? 0), 0)

    let items = docs.map(toSummary)
    if (query.sort === 'progress') {
      items = items.sort((a, b) => (b.progress?.updatedAt?.getTime() ?? 0) - (a.progress?.updatedAt?.getTime() ?? 0))
    }
    return {
      items,
      counts: {
        all: Object.values(byKind).reduce((a, b) => a + b, 0),
        books: sum(CATEGORY_KINDS.books),
        articles: sum(CATEGORY_KINDS.articles),
        notes: sum(CATEGORY_KINDS.notes),
        scans: sum(CATEGORY_KINDS.scans),
      },
    }
  }

  async get(userId: string, id: string) {
    return toSummary(await this.owned(userId, id))
  }

  async upload(userId: string, file: { filename: string; mimetype: string; buffer: Buffer }) {
    const ext = path.extname(file.filename).slice(1).toLowerCase()
    const type = ALLOWED_UPLOADS[ext]
    if (!type) {
      throw new AppError('That file type isn\'t supported yet. Try PDF, Word, ePub, text or a photo.', 415, 'UNSUPPORTED_FILE')
    }
    if (!file.buffer.length) throw new AppError('That file is empty', 400, 'EMPTY_FILE')

    const title = path.basename(file.filename, path.extname(file.filename)).replace(/[_-]+/g, ' ').trim() || 'Untitled'
    const doc = await this.documentsRepository.create({
      userId,
      title: title.slice(0, 200),
      kind: type.kind,
      fileName: file.filename.slice(0, 255),
      mimeType: type.mime,
    })
    const fileKey = sourceKey(userId, doc.id, ext)
    await storage.put(fileKey, file.buffer, type.mime)
    const saved = await this.documentsRepository.update(doc.id, { fileKey })
    await this.enqueue({ documentId: doc.id })
    return toSummary(saved)
  }

  async createFromText(userId: string, { title, text }: TextBody) {
    const doc = await this.documentsRepository.create({ userId, title: title || UNTITLED, kind: 'TEXT', mimeType: 'text/plain' })
    const fileKey = sourceKey(userId, doc.id, 'txt')
    await storage.put(fileKey, Buffer.from(text, 'utf8'), 'text/plain')
    const saved = await this.documentsRepository.update(doc.id, { fileKey })
    await this.enqueue({ documentId: doc.id })
    return toSummary(saved)
  }

  async createFromUrl(userId: string, { url }: UrlBody) {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const doc = await this.documentsRepository.create({ userId, title: host, kind: 'WEB', sourceUrl: url, author: host })
    await this.enqueue({ documentId: doc.id })
    return toSummary(doc)
  }

  /** Renames and/or moves a document between folders and the shelf */
  async update(userId: string, id: string, { title, folderId }: UpdateBody) {
    const doc = await this.owned(userId, id)
    if (folderId && !(await this.documentsRepository.findOwnedFolder(userId, folderId))) {
      throw new AppError('Folder not found', 404, 'FOLDER_NOT_FOUND')
    }
    const saved = await this.documentsRepository.update(id, { title, folderId })
    return toSummary({ ...saved, playback: doc.playback })
  }

  async reprocess(userId: string, id: string, ocr: boolean) {
    const doc = await this.owned(userId, id)
    if (doc.status === 'PROCESSING' || doc.status === 'PENDING') {
      throw new AppError('This document is still being prepared', 409, 'DOCUMENT_BUSY')
    }
    if (ocr && !['PDF', 'IMAGE'].includes(doc.kind)) {
      throw new AppError('Only PDFs and photos can be re-read with OCR', 400, 'OCR_NOT_SUPPORTED')
    }
    await Promise.all([storage.deletePrefix(`audio/${doc.id}`), storage.deletePrefix(`exports/${doc.id}`)])
    // New chunks start without emotions, so suggestions can run again
    const saved = await this.documentsRepository.update(id, { status: 'PENDING', error: null, autoExpression: null })
    await this.enqueue({ documentId: id, forceOcr: ocr })
    return toSummary({ ...saved, playback: doc.playback })
  }

  async remove(userId: string, id: string) {
    const doc = await this.owned(userId, id)
    await this.documentsRepository.delete(id)
    await Promise.all([
      storage.deletePrefix(`documents/${userId}/${doc.id}`),
      storage.deletePrefix(`audio/${doc.id}`),
      storage.deletePrefix(`exports/${doc.id}`),
    ]).catch((e) => console.error(`[documents] storage cleanup failed for ${id}`, e))
  }

  /**
   * Everything the player needs: text with sentence offsets for live
   * highlighting, and real durations for chunks already voiced.
   */
  async reader(userId: string, id: string, voiceId?: string) {
    const doc = await this.owned(userId, id)
    if (doc.status !== 'READY') throw new AppError('This document is still being prepared', 409, 'DOCUMENT_NOT_READY')

    const prefs = await this.voicesService.getPreferences(userId)
    const chosen = voiceId ?? doc.playback[0]?.voiceId ?? null
    const resolved = { en: this.voicesService.resolve(chosen, 'en', prefs), bn: this.voicesService.resolve(chosen, 'bn', prefs) }

    const [chunks, clips] = await Promise.all([
      this.documentsRepository.listChunks(id),
      this.documentsRepository.readyClips(id, [resolved.en.id, resolved.bn.id]),
    ])
    const known = new Map(clips.map((c) => [`${c.chunk.index}:${c.voiceId}`, c]))

    return {
      document: toSummary(doc),
      voices: { en: resolved.en.id, bn: resolved.bn.id },
      /** Whether each language's voice can take emotions */
      expressive: { en: resolved.en.expressive, bn: resolved.bn.expressive },
      speed: doc.playback[0]?.speed ?? prefs.speed,
      chunks: chunks.map((c: DocumentChunk) => {
        const voice = resolved[c.language as Lang]
        const clip = known.get(`${c.index}:${voice.id}`)
        // Audio made before the latest edit will be regenerated, so its length doesn't count
        const current = clip && clip.renderKey === planFor(c, voice).key ? clip : null
        return {
          index: c.index,
          text: c.text,
          language: c.language as Lang,
          sentences: c.sentences,
          expressions: readExpressions(c.expressions),
          estimatedMs: Math.round(c.estimatedDurationSec * 1000),
          durationMs: current?.durationMs ?? null,
        }
      }),
    }
  }
}
