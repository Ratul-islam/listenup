import type { PrismaClient } from '../../generated/prisma/client.js'

export class InvitesRepository {
  constructor(private readonly db: PrismaClient) {}

  findUser(userId: string) {
    return this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        inviteCode: true,
        invitedById: true,
        inviteRewardedAt: true,
        emailVerifiedAt: true,
        createdAt: true,
        closedAt: true,
        invitedBy: { select: { id: true, name: true, invitedById: true, closedAt: true } },
      },
    })
  }

  findByCode(inviteCode: string) {
    return this.db.user.findUnique({ where: { inviteCode }, select: { id: true, name: true, invitedById: true, closedAt: true } })
  }

  /** Sets the user's code if they have none yet; false if another user already has it */
  async setCode(userId: string, inviteCode: string) {
    try {
      const { count } = await this.db.user.updateMany({ where: { id: userId, inviteCode: null }, data: { inviteCode } })
      return count === 1 || (await this.db.user.findUnique({ where: { id: userId }, select: { inviteCode: true } }))?.inviteCode != null
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return false
      throw e
    }
  }

  /** Links the user to who invited them, once */
  async setInviter(userId: string, invitedById: string) {
    const { count } = await this.db.user.updateMany({ where: { id: userId, invitedById: null }, data: { invitedById } })
    return count === 1
  }

  /** Invites of this user that earned the reward, and invites still waiting for it */
  async inviteCounts(userId: string) {
    const [rewarded, pending] = await Promise.all([
      this.db.user.count({ where: { invitedById: userId, inviteRewardedAt: { not: null } } }),
      this.db.user.count({ where: { invitedById: userId, inviteRewardedAt: null } }),
    ])
    return { rewarded, pending }
  }

  async listenedSec(userId: string) {
    const { _sum } = await this.db.listeningDay.aggregate({ where: { userId }, _sum: { seconds: true } })
    return _sum.seconds ?? 0
  }

  /**
   * Marks the invite rewarded and adds Expressive seconds to the friend, and to
   * the inviter unless they've reached the most rewarded invites. The mark is
   * conditional, so concurrent checks reward once.
   */
  async reward(inviteeId: string, inviterId: string | null, seconds: number) {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: inviteeId, inviteRewardedAt: null },
        data: { inviteRewardedAt: new Date(), bonusExpressiveSec: { increment: seconds } },
      })
      if (count !== 1) return false
      if (inviterId) await tx.user.update({ where: { id: inviterId }, data: { bonusExpressiveSec: { increment: seconds } } })
      return true
    })
  }
}
