import type { PrismaClient } from '../../generated/prisma/client.js'

export class PlansRepository {
  constructor(private readonly db: PrismaClient) {}

  findUserPlan(userId: string) {
    return this.db.user.findUnique({ where: { id: userId }, select: { plan: true, billingCountry: true } })
  }
}
