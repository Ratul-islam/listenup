import type { PrismaClient } from '../../generated/prisma/client.js'

export interface UsageIncrement {
  characters: number
  naturalSec: number
  expressiveSec: number
  translatedChars?: number
}

export class UsageRepository {
  constructor(private readonly db: PrismaClient) {}

  findUser(userId: string) {
    return this.db.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true, planRenews: true, billingCountry: true, expressiveTrialUsedSec: true, bonusExpressiveSec: true },
    })
  }

  find(userId: string, period: string) {
    return this.db.usageMonth.findUnique({ where: { userId_period: { userId, period } } })
  }

  add(userId: string, period: string, inc: UsageIncrement) {
    return this.db.usageMonth.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, ...inc },
      update: {
        characters: { increment: inc.characters },
        naturalSec: { increment: inc.naturalSec },
        expressiveSec: { increment: inc.expressiveSec },
        translatedChars: { increment: inc.translatedChars ?? 0 },
      },
    })
  }

  addTrial(userId: string, seconds: number) {
    return this.db.user.update({ where: { id: userId }, data: { expressiveTrialUsedSec: { increment: seconds } } })
  }

  /** Spends Studio-pack seconds, never going below zero */
  spendBonus(userId: string, seconds: number) {
    return this.db.$executeRaw`UPDATE "users" SET "bonusExpressiveSec" = GREATEST("bonusExpressiveSec" - ${seconds}, 0) WHERE "id" = ${userId}`
  }

  spendOn(day: string) {
    return this.db.spendDay.findMany({ where: { day }, select: { bucket: true, costMicros: true } })
  }

  addSpend(day: string, bucket: string, model: string, inc: { seconds: number; characters: number; costMicros: number }) {
    return this.db.spendDay.upsert({
      where: { day_bucket_model: { day, bucket, model } },
      create: { day, bucket, model, ...inc },
      update: {
        seconds: { increment: inc.seconds },
        characters: { increment: inc.characters },
        costMicros: { increment: inc.costMicros },
      },
    })
  }
}
