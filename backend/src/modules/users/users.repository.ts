import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'

export class UsersRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string) {
    return this.db.user.findUnique({ where: { id } })
  }

  findByEmail(email: string) {
    return this.db.user.findUnique({ where: { email } })
  }

  /** An account on the same inbox under any spelling (utils/email-key.ts); a verified one first */
  findByEmailKey(emailKey: string, { verifiedOnly = false, exceptId }: { verifiedOnly?: boolean; exceptId?: string } = {}) {
    return this.db.user.findFirst({
      where: { emailKey, ...(verifiedOnly && { emailVerifiedAt: { not: null } }), ...(exceptId && { id: { not: exceptId } }) },
      orderBy: [{ emailVerifiedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    })
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
