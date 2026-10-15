import type { Prisma, PrismaClient, PublicationKind, PublicationStatus } from '../../generated/prisma/client.js'

// The writer's pen name goes with every publication shown
const withWriter = { user: { select: { penName: true } } } as const
export type PublicationWithWriter = Prisma.PublicationGetPayload<{ include: typeof withWriter }>

/** A place on a contest board: hearts that count (`score`) and everything shown with it */
export interface Standing {
  id: string
  userId: string
  title: string
  language: string
  penName: string | null
  board: string
  score: number
  hearts: number
  place: number
}

const DAY_MS = 86_400_000

export class CommunityRepository {
  constructor(private readonly db: PrismaClient) {}

  findUser(userId: string) {
    return this.db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, penName: true, communityRulesAt: true, closedAt: true },
    })
  }

  /** False when another writer already has this pen name */
  async setPenName(userId: string, penName: string, penNameKey: string) {
    try {
      await this.db.user.update({ where: { id: userId }, data: { penName, penNameKey } })
      return true
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return false
      throw e
    }
  }

  acceptRules(userId: string) {
    return this.db.user.updateMany({ where: { id: userId, communityRulesAt: null }, data: { communityRulesAt: new Date() } })
  }

  findDocument(userId: string, id: string) {
    return this.db.document.findFirst({ where: { id, userId, masterOf: { is: null } }, include: { playback: { where: { userId } } } })
  }

  listChunks(documentId: string) {
    return this.db.documentChunk.findMany({ where: { documentId }, orderBy: { index: 'asc' } })
  }

  /** A writing from this document that's still in Explore (or on its way), if any */
  findActiveFrom(userId: string, sourceId: string) {
    return this.db.publication.findFirst({
      where: { userId, sourceId, kind: 'WRITING', status: { in: ['CHECKING', 'LIVE', 'HIDDEN', 'FAILED'] } },
      select: { id: true, status: true, title: true },
    })
  }

  countSince(userId: string, kind: PublicationKind, since: Date) {
    return this.db.publication.count({ where: { userId, kind, createdAt: { gte: since } } })
  }

  findEntry(userId: string, month: string) {
    return this.db.publication.findUnique({ where: { userId_contestMonth: { userId, contestMonth: month } }, include: withWriter })
  }

  /**
   * A writing: its frozen copy (the parts as published, owned by the writer
   * and never on a shelf) and the publication, together
   */
  createWriting(
    master: Omit<Prisma.DocumentUncheckedCreateInput, 'id'>,
    chunks: Omit<Prisma.DocumentChunkCreateManyInput, 'documentId'>[],
    publication: Omit<Prisma.PublicationUncheckedCreateInput, 'masterId'>,
  ) {
    return this.db.$transaction(async (tx) => {
      const doc = await tx.document.create({ data: master })
      await tx.documentChunk.createMany({ data: chunks.map((c) => ({ ...c, documentId: doc.id })) })
      return tx.publication.create({ data: { ...publication, masterId: doc.id }, include: withWriter })
    })
  }

  createClip(data: Prisma.PublicationUncheckedCreateInput) {
    return this.db.publication.create({ data, include: withWriter })
  }

  findById(id: string) {
    return this.db.publication.findUnique({ where: { id }, include: { ...withWriter, user: { select: { penName: true, closedAt: true } } } })
  }

  /** A writing's frozen parts, to voice them */
  findForVoicing(id: string) {
    return this.db.publication.findUnique({ where: { id }, include: { master: { include: { chunks: { orderBy: { index: 'asc' } } } } } })
  }

  setStatus(id: string, status: PublicationStatus, data: Omit<Prisma.PublicationUncheckedUpdateInput, 'status'> = {}) {
    return this.db.publication.update({ where: { id }, data: { status, ...data } })
  }

  /** Back to the drawn cover (the picture wasn't accepted); nothing happens if it was unpublished meanwhile */
  clearCover(id: string) {
    return this.db.publication.updateMany({ where: { id }, data: { coverKey: null } })
  }

  /** Newest first, without writers the viewer blocked or pieces they reported */
  feed(viewerId: string, kind: PublicationKind, before: { at: Date; id: string } | null, take: number) {
    return this.db.publication.findMany({
      where: {
        kind,
        status: 'LIVE',
        user: { closedAt: null, blockedBy: { none: { userId: viewerId } } },
        flags: { none: { userId: viewerId } },
        ...(before && { OR: [{ publishedAt: { lt: before.at } }, { publishedAt: before.at, id: { lt: before.id } }] }),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take,
      include: withWriter,
    })
  }

  findManyLive(ids: string[]) {
    return this.db.publication.findMany({ where: { id: { in: ids }, status: 'LIVE' }, include: withWriter })
  }

  /** Which of these the viewer has hearted, and which writings are on their shelf */
  async viewerState(viewerId: string, ids: string[]) {
    if (!ids.length) return { hearted: new Set<string>(), copies: new Map<string, string>() }
    const [votes, copies] = await Promise.all([
      this.db.publicationVote.findMany({ where: { userId: viewerId, publicationId: { in: ids } }, select: { publicationId: true } }),
      this.db.document.findMany({ where: { userId: viewerId, publicationId: { in: ids } }, select: { id: true, publicationId: true } }),
    ])
    return {
      hearted: new Set(votes.map((v) => v.publicationId)),
      copies: new Map(copies.map((d) => [d.publicationId!, d.id])),
    }
  }

  mine(userId: string) {
    return this.db.publication.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100, include: withWriter })
  }

  /** How long the viewer has played their copy of a writing */
  copyProgress(userId: string, publicationId: string) {
    return this.db.playbackState.findFirst({ where: { userId, document: { publicationId } }, select: { listenedSec: true, completedAt: true } })
  }

  /** Hearts it; nothing changes if it's hearted already */
  addVote(publicationId: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.publicationVote.createMany({ data: [{ publicationId, userId }], skipDuplicates: true })
      return tx.publication.update({ where: { id: publicationId }, data: count ? { hearts: { increment: 1 } } : {}, select: { hearts: true } })
    })
  }

  removeVote(publicationId: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.publicationVote.deleteMany({ where: { publicationId, userId } })
      return tx.publication.update({ where: { id: publicationId }, data: count ? { hearts: { decrement: 1 } } : {}, select: { hearts: true } })
    })
  }

  /** One report per listener; enough of them hide a live publication until it's reviewed */
  report(publicationId: string, userId: string, reason: string, note: string | undefined, hideAt: number) {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.publicationReport.createMany({ data: [{ publicationId, userId, reason, note }], skipDuplicates: true })
      if (!count) return
      const { reports, status } = await tx.publication.update({ where: { id: publicationId }, data: { reports: { increment: 1 } }, select: { reports: true, status: true } })
      if (status === 'LIVE' && reports >= hideAt) {
        await tx.publication.update({ where: { id: publicationId }, data: { status: 'HIDDEN', statusNote: 'Some listeners reported this, so it’s out of Explore while we take a look.' } })
      }
    })
  }

  block(userId: string, blockedId: string) {
    return this.db.userBlock.createMany({ data: [{ userId, blockedId }], skipDuplicates: true })
  }

  unblock(userId: string, blockedId: string) {
    return this.db.userBlock.deleteMany({ where: { userId, blockedId } })
  }

  blocks(userId: string) {
    return this.db.userBlock.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { blockedId: true, createdAt: true, blocked: { select: { penName: true } } } })
  }

  /** A writing goes with its frozen copy (and so every listener's copy); a clip on its own */
  async remove(publication: { id: string; masterId: string | null }) {
    if (publication.masterId) await this.db.document.delete({ where: { id: publication.masterId } })
    else await this.db.publication.delete({ where: { id: publication.id } })
  }

  /** Taken down after review: out of Explore and off every listener's shelf, kept for the record */
  takeDown(id: string, statusNote: string) {
    return this.db.$transaction([
      this.db.publication.update({ where: { id }, data: { status: 'REMOVED', statusNote } }),
      this.db.document.deleteMany({ where: { publicationId: id } }),
    ])
  }

  /** Reported pieces waiting for review, and what the AI check turned down lately (to catch its mistakes) */
  reviewQueue() {
    return this.db.publication.findMany({
      where: { OR: [{ status: 'HIDDEN' }, { status: 'REJECTED', updatedAt: { gte: new Date(Date.now() - 30 * DAY_MS) } }] },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        user: { select: { penName: true, email: true } },
        flags: { orderBy: { createdAt: 'desc' }, take: 10, select: { reason: true, note: true, createdAt: true } },
        master: { select: { chunks: { orderBy: { index: 'asc' }, take: 8, select: { text: true } } } },
      },
    })
  }

  findBlob(hash: string) {
    return this.db.audioBlob.findUnique({ where: { hash }, select: { storageKey: true, durationMs: true, mimeType: true } })
  }

  countListen(id: string) {
    return this.db.publication.update({ where: { id }, data: { listens: { increment: 1 } }, select: { id: true } })
  }

  // --- The monthly contest

  findContest(month: string) {
    return this.db.contest.findUnique({ where: { month } })
  }

  setTheme(month: string, theme: string | null) {
    return this.db.contest.upsert({ where: { month }, create: { month, theme }, update: { theme } })
  }

  /**
   * Each board's leaders. A heart counts if it was given before the month
   * ended, by an account that had a verified email, was open, and was at least
   * `voterMinDays` old when it hearted. Accounts on one inbox (Gmail dots,
   * "+tags") count once together, and never for the writer's own inbox. Ties go
   * to more hearts overall, then to whoever published first.
   */
  standings(month: string, end: Date, voterMinDays: number, perBoard: number) {
    return this.db.$queryRaw<Standing[]>`
      WITH scored AS (
        SELECT p.id, p."userId", p.title, p.language, p.hearts, p."publishedAt", w."penName",
          CASE WHEN p.language IN ('bn', 'en') THEN p.language ELSE 'other' END AS board,
          COUNT(DISTINCT COALESCE(u."emailKey", u.id))::int AS score
        FROM publications p
        JOIN users w ON w.id = p."userId" AND w."closedAt" IS NULL
        LEFT JOIN publication_votes v ON v."publicationId" = p.id AND v."createdAt" < ${end}
        LEFT JOIN users u ON u.id = v."userId"
          AND u."emailVerifiedAt" IS NOT NULL
          AND u."closedAt" IS NULL
          AND u."createdAt" <= v."createdAt" - (${voterMinDays}::int * interval '1 day')
          AND NOT (u."emailKey" IS NOT NULL AND u."emailKey" = w."emailKey")
        WHERE p."contestMonth" = ${month} AND p.status = 'LIVE' AND p.kind = 'WRITING'
        GROUP BY p.id, w."penName"
      )
      SELECT id, "userId", title, language, "penName", board, score, hearts, place
      FROM (
        SELECT scored.*, (ROW_NUMBER() OVER (PARTITION BY board ORDER BY score DESC, hearts DESC, "publishedAt" ASC))::int AS place
        FROM scored
      ) ranked
      WHERE place <= ${perBoard}
      ORDER BY board, place`
  }

  /** Past months with entries whose prizes haven't gone out yet */
  async unsettledMonths(before: string) {
    const [entered, settled] = await Promise.all([
      this.db.publication.groupBy({ by: ['contestMonth'], where: { contestMonth: { not: null, lt: before } } }),
      this.db.contest.findMany({ where: { settledAt: { not: null }, month: { lt: before } }, select: { month: true } }),
    ])
    const done = new Set(settled.map((c) => c.month))
    return entered.map((e) => e.contestMonth!).filter((m) => !done.has(m)).sort()
  }

  /**
   * Gives a month's prizes once: marks the month settled and, in the same
   * transaction, records each win and adds its minutes. Empty if it was settled already.
   */
  settle(month: string, wins: Omit<Prisma.ContestWinUncheckedCreateInput, 'month'>[]) {
    return this.db.$transaction(async (tx) => {
      await tx.contest.upsert({ where: { month }, create: { month }, update: {} })
      const { count } = await tx.contest.updateMany({ where: { month, settledAt: null }, data: { settledAt: new Date() } })
      if (!count) return []
      for (const win of wins) {
        await tx.contestWin.create({ data: { ...win, month } })
        await tx.user.update({ where: { id: win.userId }, data: { bonusExpressiveSec: { increment: win.seconds } } })
      }
      return wins
    })
  }

  /** The latest month whose prizes went out, with its winners */
  lastSettled(before: string) {
    return this.db.contest.findFirst({
      where: { settledAt: { not: null }, month: { lt: before } },
      orderBy: { month: 'desc' },
      include: { wins: { orderBy: [{ board: 'asc' }, { place: 'asc' }] } },
    })
  }

  unseenWins(userId: string) {
    return this.db.contestWin.findMany({ where: { userId, seenAt: null }, orderBy: { createdAt: 'asc' } })
  }

  markWinsSeen(userId: string) {
    return this.db.contestWin.updateMany({ where: { userId, seenAt: null }, data: { seenAt: new Date() } })
  }

  findEmails(userIds: string[]) {
    return this.db.user.findMany({ where: { id: { in: userIds }, closedAt: null }, select: { id: true, email: true, penName: true } })
  }
}
