import type { PrismaClient } from '../../generated/prisma/client.js'

export class UsageRepository {
  constructor(private readonly db: PrismaClient) {}

  findUserPlan(userId: string) {
    return this.db.user.findUnique({ where: { id: userId }, select: { plan: true } })
  }

  find(userId: string, period: string) {
    return this.db.usageMonth.findUnique({ where: { userId_period: { userId, period } } })
  }

  add(userId: string, period: string, characters: number) {
    return this.db.usageMonth.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, characters },
      update: { characters: { increment: characters } },
    })
  }
}
