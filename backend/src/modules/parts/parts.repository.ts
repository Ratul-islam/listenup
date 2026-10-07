import { Prisma, type PrismaClient } from '../../generated/prisma/client.js'
import type { ChunkExpressions } from '../expressions/expression-catalog.js'
import type { ChunkDraft } from '../ingestion/text/chunker.js'
import { documentLanguage, type Lang } from '../ingestion/text/language.js'
import { makeExcerpt } from '../ingestion/text/normalize.js'

/** A part to store: chunker output plus what it carries over */
export interface PartDraft extends ChunkDraft {
  expressions: ChunkExpressions
  narration: string | null
  /** The part's own voice (a character), carried over from the part it came from */
  voiceId?: string | null
  pauseAfterMs?: number
}

// Parts after an insert or delete are moved out of the way first, so the
// unique (document, index) pair never clashes mid-update
const PARKED = 1_000_000

type Tx = Prisma.TransactionClient

const json = (value: unknown) => value as Prisma.InputJsonValue

export class PartsRepository {
  constructor(private readonly db: PrismaClient) {}

  findOwned(userId: string, documentId: string) {
    return this.db.document.findFirst({ where: { id: documentId, userId }, include: { playback: { where: { userId } } } })
  }

  findPart(documentId: string, index: number) {
    return this.db.documentChunk.findUnique({ where: { documentId_index: { documentId, index } } })
  }

  countParts(documentId: string) {
    return this.db.documentChunk.count({ where: { documentId } })
  }

  /** Moves every part from `from` on by `delta`, with the listener's place and bookmarks */
  private async shift(tx: Tx, documentId: string, from: number, delta: number) {
    if (!delta) return
    await tx.$executeRaw`UPDATE "document_chunks" SET "index" = "index" + ${PARKED} WHERE "documentId" = ${documentId} AND "index" >= ${from}`
    await tx.$executeRaw`UPDATE "document_chunks" SET "index" = "index" - ${PARKED} + ${delta} WHERE "documentId" = ${documentId} AND "index" >= ${PARKED}`
    await tx.$executeRaw`UPDATE "playback_states" SET "chunkIndex" = GREATEST("chunkIndex" + ${delta}, 0) WHERE "documentId" = ${documentId} AND "chunkIndex" >= ${from}`
    await tx.$executeRaw`UPDATE "bookmarks" SET "chunkIndex" = GREATEST("chunkIndex" + ${delta}, 0) WHERE "documentId" = ${documentId} AND "chunkIndex" >= ${from}`
  }

  private createParts(tx: Tx, documentId: string, at: number, drafts: PartDraft[]) {
    return tx.documentChunk.createMany({
      data: drafts.map((d, i) => ({
        documentId,
        index: at + i,
        text: d.text,
        language: d.language,
        sentences: json(d.sentences),
        expressions: json(d.expressions),
        narration: d.narration,
        voiceId: d.voiceId ?? null,
        pauseAfterMs: d.pauseAfterMs ?? 0,
        estimatedDurationSec: d.estimatedDurationSec,
      })),
    })
  }

  /**
   * Swaps one part for one or more new ones. The first keeps the part's row, so
   * nothing else about it changes; its old audio is replaced when it's next voiced.
   */
  replacePart(documentId: string, chunkId: string, index: number, drafts: PartDraft[]) {
    return this.db.$transaction(
      async (tx) => {
        await this.shift(tx, documentId, index + 1, drafts.length - 1)
        const [first, ...rest] = drafts
        await tx.documentChunk.update({
          where: { id: chunkId },
          data: {
            text: first.text,
            language: first.language,
            sentences: json(first.sentences),
            expressions: json(first.expressions),
            estimatedDurationSec: first.estimatedDurationSec,
            voiceId: first.voiceId ?? null,
            pauseAfterMs: first.pauseAfterMs ?? 0,
            take: 0,
            sentenceTakes: Prisma.DbNull,
          },
        })
        if (rest.length) await this.createParts(tx, documentId, index + 1, rest)
        return this.refreshDocument(tx, documentId)
      },
      { timeout: 20_000 },
    )
  }

  insertParts(documentId: string, at: number, drafts: PartDraft[]) {
    return this.db.$transaction(
      async (tx) => {
        await this.shift(tx, documentId, at, drafts.length)
        await this.createParts(tx, documentId, at, drafts)
        return this.refreshDocument(tx, documentId)
      },
      { timeout: 20_000 },
    )
  }

  deletePart(documentId: string, chunkId: string, index: number) {
    return this.db.$transaction(
      async (tx) => {
        await tx.documentChunk.delete({ where: { id: chunkId } })
        await this.shift(tx, documentId, index + 1, -1)
        return this.refreshDocument(tx, documentId)
      },
      { timeout: 20_000 },
    )
  }

  setExpressions(chunkId: string, expressions: ChunkExpressions) {
    return this.db.documentChunk.update({ where: { id: chunkId }, data: { expressions: json(expressions) } })
  }

  /** A fresh whole-part recording replaces any redone sentences too */
  newTake(chunkId: string) {
    return this.db.documentChunk.update({ where: { id: chunkId }, data: { take: { increment: 1 }, sentenceTakes: Prisma.DbNull } })
  }

  setSentenceTakes(chunkId: string, takes: Record<number, number>) {
    return this.db.documentChunk.update({ where: { id: chunkId }, data: { sentenceTakes: json(takes) } })
  }

  updatePart(chunkId: string, data: Prisma.DocumentChunkUncheckedUpdateInput) {
    return this.db.documentChunk.update({ where: { id: chunkId }, data })
  }

  listAll(documentId: string) {
    return this.db.documentChunk.findMany({ where: { documentId }, orderBy: { index: 'asc' } })
  }

  listParts(documentId: string, from: number, count: number) {
    return this.db.documentChunk.findMany({ where: { documentId, index: { gte: from, lt: from + count } }, orderBy: { index: 'asc' } })
  }

  /** The document's totals after its parts changed, and when it was edited */
  private async refreshDocument(tx: Tx, documentId: string) {
    const parts = await tx.documentChunk.findMany({ where: { documentId }, orderBy: { index: 'asc' }, select: { text: true, language: true, estimatedDurationSec: true } })
    return tx.document.update({
      where: { id: documentId },
      data: {
        chunkCount: parts.length,
        charCount: parts.reduce((n, p) => n + p.text.length, 0),
        estimatedDurationSec: Math.round(parts.reduce((n, p) => n + p.estimatedDurationSec, 0)),
        language: documentLanguage(parts.map((p) => ({ text: p.text, language: p.language as Lang }))),
        excerpt: makeExcerpt(parts.slice(0, 3).map((p) => p.text)),
        editedAt: new Date(),
      },
      include: { playback: { take: 1 } },
    })
  }

  markEdited(documentId: string) {
    return this.db.document.update({ where: { id: documentId }, data: { editedAt: new Date() }, include: { playback: { take: 1 } } })
  }
}
