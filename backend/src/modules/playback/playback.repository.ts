import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'

export class PlaybackRepository {
  constructor(private readonly db: PrismaClient) {}

  findReadyDocument(userId: string, documentId: string) {
    return this.db.document.findFirst({
      where: { id: documentId, userId },
      include: { playback: { where: { userId } } },
    })
  }

  findChunk(documentId: string, index: number) {
    return this.db.documentChunk.findUnique({ where: { documentId_index: { documentId, index } } })
  }

  findChunks(documentId: string, from: number, count: number) {
    return this.db.documentChunk.findMany({
      where: { documentId, index: { gte: from, lt: from + count } },
      orderBy: { index: 'asc' },
    })
  }

  upsertState(userId: string, documentId: string, data: Omit<Prisma.PlaybackStateUncheckedCreateInput, 'userId' | 'documentId'>) {
    return this.db.playbackState.upsert({
      where: { userId_documentId: { userId, documentId } },
      create: { userId, documentId, ...data },
      update: data,
    })
  }

  addListening(userId: string, day: string, seconds: number) {
    return this.db.listeningDay.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, seconds },
      update: { seconds: { increment: seconds } },
    })
  }

  recentDays(userId: string, limit: number) {
    return this.db.listeningDay.findMany({ where: { userId }, orderBy: { day: 'desc' }, take: limit })
  }

  listBookmarks(userId: string, documentId: string) {
    return this.db.bookmark.findMany({ where: { userId, documentId }, orderBy: [{ chunkIndex: 'asc' }, { offsetMs: 'asc' }] })
  }

  createBookmark(data: Prisma.BookmarkUncheckedCreateInput) {
    return this.db.bookmark.create({ data })
  }

  deleteBookmark(userId: string, id: string) {
    return this.db.bookmark.deleteMany({ where: { id, userId } })
  }
}
