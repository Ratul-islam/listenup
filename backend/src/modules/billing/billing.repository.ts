import type { PrismaClient } from '../../generated/prisma/client.js'
import type { PlanId } from '../plans/plan-catalog.js'

export class BillingRepository {
  constructor(private readonly db: PrismaClient) {}

  /** Existing users among RevenueCat's ids for a customer (our user ids, plus anonymous ones) */
  findUsers(ids: string[]) {
    return this.db.user.findMany({ where: { id: { in: ids } }, select: { id: true } })
  }

  setCountry(userId: string, billingCountry: string) {
    return this.db.user.update({ where: { id: userId }, data: { billingCountry } })
  }

  setPlan(userId: string, plan: PlanId, planExpiresAt: Date | null, planRenews: boolean) {
    return this.db.user.update({
      where: { id: userId },
      data: { plan, planExpiresAt, planRenews },
      select: { plan: true, planExpiresAt: true, planRenews: true, bonusExpressiveSec: true },
    })
  }

  /** Credits a Studio pack once per transaction; false if it was credited before */
  async creditPack(userId: string, transactionId: string, productId: string, seconds: number, isSandbox: boolean) {
    try {
      await this.db.$transaction([
        this.db.studioPackPurchase.create({ data: { id: transactionId, userId, productId, seconds, isSandbox } }),
        this.db.user.update({ where: { id: userId }, data: { bonusExpressiveSec: { increment: seconds } } }),
      ])
      return true
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return false
      throw e
    }
  }

  /** Paid plans whose period ended before `before` (plans set by hand have no end date) */
  lapsedPaidUsers(before: Date) {
    return this.db.user.findMany({
      where: { plan: { not: 'free' }, planExpiresAt: { lt: before } },
      select: { id: true },
      take: 500,
    })
  }
}
