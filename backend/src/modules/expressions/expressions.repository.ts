import { Prisma, type AutoExpressionStatus, type PrismaClient } from '../../generated/prisma/client.js'
import type { ChunkExpressions } from './expression-catalog.js'

const json = (e: ChunkExpressions) => e as unknown as Prisma.InputJsonValue

export class ExpressionsRepository {
  constructor(private readonly db: PrismaClient) {}

  findOwned(userId: string, documentId: string) {
    return this.db.document.findFirst({
      where: { id: documentId, userId },
      include: { playback: { where: { userId }, take: 1 } },
    })
  }

  findById(documentId: string) {
    return this.db.document.findUnique({ where: { id: documentId }, include: { playback: { take: 1 } } })
  }

  findChunk(documentId: string, index: number) {
    return this.db.documentChunk.findUnique({ where: { documentId_index: { documentId, index } } })
  }

  listChunks(documentId: string, fromIndex = 0) {
    return this.db.documentChunk.findMany({ where: { documentId, index: { gte: fromIndex } }, orderBy: { index: 'asc' } })
  }

  /** Parts "Make it expressive" may direct: locked parts keep how they sound */
  listUnlockedChunks(documentId: string, fromIndex = 0) {
    return this.db.documentChunk.findMany({ where: { documentId, locked: false, index: { gte: fromIndex } }, orderBy: { index: 'asc' } })
  }

  /** Chunks that have any emotions or sounds */
  listExpressiveChunks(documentId: string) {
    return this.db.documentChunk.findMany({
      where: { documentId, locked: false, expressions: { not: Prisma.DbNull } },
      select: { id: true, expressions: true },
    })
  }

  setChunk(chunkId: string, expressions: ChunkExpressions) {
    return this.db.documentChunk.update({ where: { id: chunkId }, data: { expressions: json(expressions) } })
  }

  /**
   * One statement for every chunk: a whole document's worth of separate
   * updates outlasts the transaction timeout over a distant database.
   */
  async setChunks(updates: { id: string; expressions: ChunkExpressions }[]) {
    if (!updates.length) return
    await this.db.$executeRaw`
      UPDATE "document_chunks" AS c SET "expressions" = u.expressions
      FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS u(id text, expressions jsonb)
      WHERE c."id" = u.id`
  }

  findUserPlan(userId: string) {
    return this.db.user.findUnique({ where: { id: userId }, select: { plan: true } })
  }

  /** The first chunks of a document, for sampling its opening */
  firstChunks(documentId: string, take: number) {
    return this.db.documentChunk.findMany({ where: { documentId }, orderBy: { index: 'asc' }, take, select: { text: true } })
  }

  setNarration(
    documentId: string,
    data: { narrationStyle?: string | null; narrationStrength?: string | null; narrationBrief?: Prisma.InputJsonValue | typeof Prisma.DbNull },
  ) {
    return this.db.document.update({ where: { id: documentId }, data, include: { playback: { take: 1 } } })
  }

  /** Every unlocked chunk is voiced with this narration from now on (null: plain) */
  stampNarration(documentId: string, narration: string | null) {
    return this.db.documentChunk.updateMany({ where: { documentId, locked: false }, data: { narration } })
  }

  setAutoStatus(documentId: string, autoExpression: AutoExpressionStatus) {
    return this.db.document.update({ where: { id: documentId }, data: { autoExpression }, include: { playback: { take: 1 } } })
  }
}
