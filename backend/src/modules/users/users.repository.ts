import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'

export class UsersRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string) {
    return this.db.user.findUnique({ where: { id } })
  }

  findByEmail(email: string) {
    return this.db.user.findUnique({ where: { email } })
  }

  create(data: Prisma.UserCreateInput) {
    return this.db.user.create({ data })
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return this.db.user.update({ where: { id }, data })
  }

  /** Signs the user out everywhere */
  revokeSessions(userId: string) {
    return this.db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
  }

  /** Accounts closed before the cutoff, with their documents (for storage cleanup) */
  findClosedBefore(cutoff: Date) {
    return this.db.user.findMany({ where: { closedAt: { lt: cutoff } }, select: { id: true, documents: { select: { id: true } } } })
  }

  delete(id: string) {
    return this.db.user.delete({ where: { id } })
  }
}
