import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'

export class VoicesRepository {
  constructor(private readonly db: PrismaClient) {}

  findPreference(userId: string) {
    return this.db.userPreference.findUnique({ where: { userId } })
  }

  upsertPreference(userId: string, data: Omit<Prisma.UserPreferenceUncheckedCreateInput, 'userId'>) {
    return this.db.userPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data })
  }
}
