import { randomInt } from 'node:crypto'
import { INVITE_MAX_REWARDS, INVITE_MIN_LISTEN_SEC, INVITE_REDEEM_DAYS, INVITE_REWARD_MINUTES } from '../../config/constants.js'
import { env } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'
import type { InvitesRepository } from './invites.repository.js'

// No 0/O, 1/I/L: codes get read aloud and typed
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const DAY_MS = 24 * 60 * 60_000

const newCode = () => Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')

/** Google Play link that hands the code to the app on first launch (install referrer) */
const playLink = (code: string) =>
  `https://play.google.com/store/apps/details?id=${env.ANDROID_PACKAGE}&referrer=${encodeURIComponent(`invite=${code}`)}`

/**
 * "Invite a friend": both people get Expressive minutes once the friend has
 * verified their email and listened for a few minutes, so throwaway accounts
 * earn nothing. Each person is rewarded for a limited number of invites; friends
 * beyond that still get their own minutes.
 */
export class InvitesService {
  constructor(private readonly invitesRepository: InvitesRepository) {}

  private async user(userId: string) {
    const user = await this.invitesRepository.findUser(userId)
    if (!user || user.closedAt) throw new AppError('Account not found', 404, 'USER_NOT_FOUND')
    return user
  }

  private async ensureCode(userId: string, existing: string | null) {
    if (existing) return existing
    for (let i = 0; i < 5; i++) {
      const code = newCode()
      if (await this.invitesRepository.setCode(userId, code)) return (await this.invitesRepository.findUser(userId))!.inviteCode!
    }
    throw new AppError("Couldn't make an invite code. Try again.", 500, 'INVITE_CODE_FAILED')
  }

  async overview(userId: string) {
    const user = await this.user(userId)
    const code = await this.ensureCode(userId, user.inviteCode)
    const counts = await this.invitesRepository.inviteCounts(userId)
    const redeemUntil = new Date(user.createdAt.getTime() + INVITE_REDEEM_DAYS * DAY_MS)
    return {
      code,
      link: playLink(code),
      minutesEach: INVITE_REWARD_MINUTES,
      maxRewards: INVITE_MAX_REWARDS,
      rewarded: counts.rewarded,
      pending: counts.pending,
      invitedBy: user.invitedBy ? { name: user.invitedBy.name, rewarded: !!user.inviteRewardedAt } : null,
      /** New accounts can still enter a friend's code */
      canRedeem: !user.invitedById && Date.now() < redeemUntil.getTime(),
      listenMinutesNeeded: INVITE_MIN_LISTEN_SEC / 60,
    }
  }

  async redeem(userId: string, code: string) {
    const user = await this.user(userId)
    if (user.invitedById) throw new AppError("You've already used an invite code.", 409, 'INVITE_ALREADY_USED')
    if (Date.now() > user.createdAt.getTime() + INVITE_REDEEM_DAYS * DAY_MS) {
      throw new AppError(`Invite codes work in the first ${INVITE_REDEEM_DAYS} days after signing up.`, 409, 'INVITE_TOO_LATE')
    }
    const inviter = await this.invitesRepository.findByCode(code)
    if (!inviter || inviter.closedAt) throw new AppError("That invite code doesn't exist. Check it and try again.", 404, 'INVITE_NOT_FOUND')
    if (inviter.id === userId) throw new AppError("That's your own code. Share it with a friend instead.", 400, 'INVITE_OWN_CODE')
    if (inviter.invitedById === userId) throw new AppError("You invited this person, so you can't use their code.", 400, 'INVITE_CIRCULAR')

    await this.invitesRepository.setInviter(userId, inviter.id)
    await this.checkReward(userId)
    return this.overview(userId)
  }

  /**
   * Gives the invite's minutes once the friend qualifies. Called after listening
   * is recorded and after email verification; cheap when there's nothing to give.
   */
  async checkReward(userId: string) {
    const user = await this.invitesRepository.findUser(userId)
    if (!user?.invitedById || user.inviteRewardedAt || !user.emailVerifiedAt || user.closedAt) return false
    if ((await this.invitesRepository.listenedSec(userId)) < INVITE_MIN_LISTEN_SEC) return false

    const inviter = user.invitedBy
    const inviterEligible =
      !!inviter && !inviter.closedAt && (await this.invitesRepository.inviteCounts(inviter.id)).rewarded < INVITE_MAX_REWARDS
    return this.invitesRepository.reward(userId, inviterEligible ? inviter!.id : null, INVITE_REWARD_MINUTES * 60)
  }
}
