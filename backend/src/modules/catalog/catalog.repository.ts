import type { PrismaClient } from '../../generated/prisma/client.js'

export class CatalogRepository {
  constructor(private readonly db: PrismaClient) {}

  /** The listener's documents made from these catalog texts, to show what's already on their shelf */
  findAdded(userId: string, fileKeys: string[]) {
    return this.db.document.findMany({
      where: { userId, fileKey: { in: fileKeys } },
      select: { id: true, fileKey: true, status: true },
      orderBy: { createdAt: 'asc' },
    })
  }
}
