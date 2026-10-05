import type { PrismaClient } from '../../generated/prisma/client.js'

export class AdsRepository {
  constructor(private readonly db: PrismaClient) {}

  findUser(userId: string) {
    return this.db.user.findUnique({ where: { id: userId }, select: { id: true, plan: true, closedAt: true } })
  }

  rewardsOn(userId: string, day: string) {
    return this.db.adReward.count({ where: { userId, day } })
  }

  /**
   * Adds a reward's Natural seconds to this month. Verified rewards carry AdMob's
   * transaction id and count once; false if this one was credited before.
   */
  async credit(userId: string, day: string, period: string, seconds: number, transactionId: string | null) {
    try {
      await this.db.$transaction([
        this.db.adReward.create({ data: { userId, day, seconds, transactionId } }),
        this.db.usageMonth.upsert({
          where: { userId_period: { userId, period } },
          create: { userId, period, bonusNaturalSec: seconds },
          update: { bonusNaturalSec: { increment: seconds } },
        }),
      ])
      return true
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return false
      throw e
    }
  }
}
