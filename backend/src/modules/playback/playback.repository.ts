import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'

export class PlaybackRepository {
  constructor(private readonly db: PrismaClient) {}

  findReadyDocument(userId: string, documentId: string) {
    return this.db.document.findFirst({
      where: { id: documentId, userId },
      include: { playback: { where: { userId } } },
    })
  }

  findUserPlan(userId: string) {
    return this.db.user.findUnique({ where: { id: userId }, select: { plan: true } })
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

  /** `listenedSec` is added to what the document has been played for so far */
  upsertState(userId: string, documentId: string, { listenedSec = 0, ...data }: Omit<Prisma.PlaybackStateUncheckedCreateInput, 'userId' | 'documentId'> & { listenedSec?: number }) {
    return this.db.playbackState.upsert({
      where: { userId_documentId: { userId, documentId } },
      create: { userId, documentId, listenedSec, ...data },
      update: { ...data, ...(listenedSec > 0 && { listenedSec: { increment: listenedSec } }) },
    })
  }

  addListening(userId: string, day: string, seconds: number) {
    return this.db.listeningDay.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, seconds },
      update: { seconds: { increment: seconds } },
    })
  }

  /**
   * Seconds of `reportedSec` to count, moving the user's credit mark on by as much,
   * in one statement: the mark starts at most `catchUpSec` back from `now`, and
   * nothing is counted past `now`. The row lock makes a second report at the same
   * moment start from where the first left the mark.
   */
  async creditListening(userId: string, reportedSec: number, now: Date, catchUpSec: number) {
    const rows = await this.db.$queryRaw<{ sec: number }[]>`
      WITH mark AS (
        SELECT id, GREATEST(COALESCE(EXTRACT(EPOCH FROM "listenCreditedUntil"), 0), ${now.getTime() / 1000 - catchUpSec}::float8) AS start
        FROM users WHERE id = ${userId} FOR UPDATE
      ), credit AS (
        SELECT id, start, FLOOR(LEAST(${reportedSec}::float8, ${now.getTime() / 1000}::float8 - start)) AS sec FROM mark
      )
      UPDATE users u SET "listenCreditedUntil" = to_timestamp(c.start + c.sec) AT TIME ZONE 'UTC'
      FROM credit c WHERE u.id = c.id AND c.sec > 0
      RETURNING c.sec::int AS sec`
    return rows[0]?.sec ?? 0
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
