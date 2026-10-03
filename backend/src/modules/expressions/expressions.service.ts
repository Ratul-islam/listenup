import { startQueue, queue, QUEUES } from '../../lib/queue.js'
import { AppError } from '../../utils/AppError.js'
import { toSummary } from '../documents/documents.service.js'
import { autoExpress, MAX_AUTO_EXPRESSION_CHARS } from './auto-expression.js'
import { normalizeExpressions, readExpressions } from './expression-catalog.js'
import type { ExpressionsRepository } from './expressions.repository.js'
import type { ChunkExpressionsBody } from './expressions.schema.js'

/** Emotions and sounds on a document's text, set by the listener or suggested by AI */
export class ExpressionsService {
  constructor(private readonly expressionsRepository: ExpressionsRepository) {}

  private async readyDocument(userId: string, documentId: string) {
    const doc = await this.expressionsRepository.findOwned(userId, documentId)
    if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
    if (doc.status !== 'READY') throw new AppError('This document is still being prepared', 409, 'DOCUMENT_NOT_READY')
    return doc
  }

  /** Replaces one chunk's marks; its audio regenerates the next time it plays */
  async setChunk(userId: string, documentId: string, index: number, body: ChunkExpressionsBody) {
    await this.readyDocument(userId, documentId)
    const chunk = await this.expressionsRepository.findChunk(documentId, index)
    if (!chunk) throw new AppError('That part of the document does not exist', 404, 'CHUNK_NOT_FOUND')
    const expressions = normalizeExpressions(body, chunk.text.length)
    await this.expressionsRepository.setChunk(chunk.id, expressions)
    return expressions
  }

  /** "Make it expressive": suggests emotions in the background */
  async startAuto(userId: string, documentId: string) {
    const doc = await this.readyDocument(userId, documentId)
    if (doc.autoExpression === 'RUNNING') return toSummary(doc)
    const saved = await this.expressionsRepository.setAutoStatus(documentId, 'RUNNING')
    await startQueue()
    await queue.send(QUEUES.autoExpression, { documentId }, { singletonKey: documentId })
    return toSummary(saved)
  }

  /** Job body: tags from where the listener is, up to a size cap */
  async runAuto(documentId: string) {
    const doc = await this.expressionsRepository.findById(documentId)
    if (!doc || doc.status !== 'READY') return
    const from = doc.playback[0]?.chunkIndex ?? 0
    const chunks = []
    let total = 0
    for (const chunk of await this.expressionsRepository.listChunks(documentId, from)) {
      if ((total += chunk.text.length) > MAX_AUTO_EXPRESSION_CHARS && chunks.length) break
      chunks.push(chunk)
    }
    const updates = await autoExpress(chunks)
    await this.expressionsRepository.setChunks(updates)
    await this.expressionsRepository.setAutoStatus(documentId, 'DONE')
  }

  async failAuto(documentId: string) {
    await this.expressionsRepository.setAutoStatus(documentId, 'FAILED').catch(() => {})
  }

  /** Removes every mark, or only AI suggestions */
  async clear(userId: string, documentId: string, onlyAi: boolean) {
    await this.readyDocument(userId, documentId)
    const chunks = await this.expressionsRepository.listExpressiveChunks(documentId)
    const updates = chunks.map((c) => {
      const e = readExpressions(c.expressions)
      return {
        id: c.id,
        expressions: onlyAi ? { emotions: e.emotions.filter((m) => !m.ai), sounds: e.sounds.filter((m) => !m.ai) } : { emotions: [], sounds: [] },
      }
    })
    await this.expressionsRepository.setChunks(updates)
    return { chunks: updates.length }
  }
}
