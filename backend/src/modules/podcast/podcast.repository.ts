import type { PrismaClient } from '../../generated/prisma/client.js'

const episodeSelect = {
  id: true,
  title: true,
  author: true,
  excerpt: true,
  language: true,
  podcastAddedAt: true,
  export: { select: { status: true, storageKey: true, sizeBytes: true, durationMs: true, chunksDone: true, chunkCount: true, error: true, updatedAt: true } },
} as const

export class PodcastRepository {
  constructor(private readonly db: PrismaClient) {}

  findUser(userId: string) {
    return this.db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, plan: true, podcastToken: true, closedAt: true } })
  }

  findUserByToken(podcastToken: string) {
    return this.db.user.findUnique({ where: { podcastToken }, select: { id: true, name: true, plan: true, closedAt: true } })
  }

  setToken(userId: string, podcastToken: string) {
    return this.db.user.update({ where: { id: userId }, data: { podcastToken }, select: { podcastToken: true } })
  }

  /** Documents in the feed, newest first */
  episodes(userId: string) {
    return this.db.document.findMany({
      where: { userId, podcastAddedAt: { not: null } },
      orderBy: { podcastAddedAt: 'desc' },
      select: episodeSelect,
    })
  }

  episode(userId: string, documentId: string) {
    return this.db.document.findFirst({ where: { id: documentId, userId, podcastAddedAt: { not: null } }, select: episodeSelect })
  }

  /** Adds (keeping the first date) or removes a document; false if the user doesn't own it */
  async setAdded(userId: string, documentId: string, added: boolean) {
    const { count } = await this.db.document.updateMany({
      where: { id: documentId, userId, ...(added && { podcastAddedAt: null }) },
      data: { podcastAddedAt: added ? new Date() : null },
    })
    return count === 1 || (added && (await this.db.document.count({ where: { id: documentId, userId } })) === 1)
  }
}
