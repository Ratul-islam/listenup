import type { PrismaClient } from '../../generated/prisma/client.js'

export class FoldersRepository {
  constructor(private readonly db: PrismaClient) {}

  list(userId: string) {
    return this.db.folder.findMany({ where: { userId }, include: { _count: { select: { documents: true } } } })
  }

  count(userId: string) {
    return this.db.folder.count({ where: { userId } })
  }

  findOwned(userId: string, id: string) {
    return this.db.folder.findFirst({ where: { id, userId }, include: { _count: { select: { documents: true } } } })
  }

  create(userId: string, name: string) {
    return this.db.folder.create({ data: { userId, name }, include: { _count: { select: { documents: true } } } })
  }

  rename(id: string, name: string) {
    return this.db.folder.update({ where: { id }, data: { name }, include: { _count: { select: { documents: true } } } })
  }

  /** Its documents go back to the shelf (folderId is set null by the relation) */
  delete(id: string) {
    return this.db.folder.delete({ where: { id } })
  }
}
