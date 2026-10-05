import { AD_REWARD_MINUTES, AD_REWARDS_PER_DAY } from '../../config/constants.js'
import { env } from '../../config/env.js'
import { verifyRewardCallback } from '../../lib/admob-ssv.js'
import { AppError } from '../../utils/AppError.js'
import { planFor } from '../plans/plan-catalog.js'
import type { AdsRepository } from './ads.repository.js'

const today = () => new Date().toISOString().slice(0, 10)
const currentPeriod = () => new Date().toISOString().slice(0, 7)

/**
 * Ads for the Free plan: a banner on the shelf, and a rewarded ad that adds
 * Natural minutes (a few a day). Natural audio costs about $0.03 an hour, so ten
 * minutes cost half a cent; Expressive minutes are never given for ads.
 *
 * With ADMOB_SSV on, rewards arrive only from AdMob's signed server callback.
 * Without it (before AdMob is set up, or with test ads) the app reports the reward
 * itself; the daily cap keeps any misuse to a few cents.
 */
export class AdsService {
  constructor(private readonly adsRepository: AdsRepository) {}

  async status(userId: string) {
    const user = await this.adsRepository.findUser(userId)
    const showAds = planFor(user?.plan).id === 'free'
    const used = showAds ? await this.adsRepository.rewardsOn(userId, today()) : 0
    return {
      showAds,
      reward: {
        minutes: AD_REWARD_MINUTES,
        perDay: AD_REWARDS_PER_DAY,
        leftToday: showAds ? Math.max(AD_REWARDS_PER_DAY - used, 0) : 0,
        /** Rewards come from AdMob's server callback, not the app */
        verifiedByServer: env.ADMOB_SSV,
      },
    }
  }

  private async credit(userId: string, transactionId: string | null) {
    const user = await this.adsRepository.findUser(userId)
    if (!user || user.closedAt || planFor(user.plan).id !== 'free') return false
    if ((await this.adsRepository.rewardsOn(userId, today())) >= AD_REWARDS_PER_DAY) return false
    return this.adsRepository.credit(userId, today(), currentPeriod(), AD_REWARD_MINUTES * 60, transactionId)
  }

  /** The app finished a rewarded ad (used only while server-side verification is off) */
  async claim(userId: string) {
    if (!env.ADMOB_SSV) {
      const before = await this.status(userId)
      if (!before.showAds) throw new AppError('Your plan has no ads.', 400, 'NO_ADS')
      if (before.reward.leftToday <= 0) {
        throw new AppError(`That's today's ${AD_REWARDS_PER_DAY} extra sessions. More tomorrow.`, 429, 'AD_REWARDS_USED')
      }
      await this.credit(userId, null)
    }
    return this.status(userId)
  }

  /** AdMob's signed callback after a rewarded ad (server-side verification) */
  async verifiedReward(rawUrl: string) {
    const reward = await verifyRewardCallback(rawUrl)
    if (!reward) throw new AppError('Invalid signature', 403, 'BAD_SIGNATURE')
    // AdMob's "Verify" button in the console sends a callback with no real user
    if (!/^[0-9a-f-]{36}$/i.test(reward.userId)) return { credited: false }
    return { credited: await this.credit(reward.userId, reward.transactionId) }
  }
}
