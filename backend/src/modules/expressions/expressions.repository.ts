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

  /** Chunks that have any emotions or sounds */
  listExpressiveChunks(documentId: string) {
    return this.db.documentChunk.findMany({
      where: { documentId, expressions: { not: Prisma.DbNull } },
      select: { id: true, expressions: true },
    })
  }

  setChunk(chunkId: string, expressions: ChunkExpressions) {
    return this.db.documentChunk.update({ where: { id: chunkId }, data: { expressions: json(expressions) } })
  }

  setChunks(updates: { id: string; expressions: ChunkExpressions }[]) {
    return this.db.$transaction(updates.map((u) => this.db.documentChunk.update({ where: { id: u.id }, data: { expressions: json(u.expressions) } })))
  }

  setAutoStatus(documentId: string, autoExpression: AutoExpressionStatus) {
    return this.db.document.update({ where: { id: documentId }, data: { autoExpression }, include: { playback: { take: 1 } } })
  }
}
