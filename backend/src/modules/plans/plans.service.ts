import { billingConfigured } from '../../lib/revenuecat.js'
import { ownVoiceBlockedIn } from '../own-voice/own-voice.regions.js'
import { OWN_VOICE_PLAN, planFor, PLANS, rewardRegionFor } from './plan-catalog.js'
import type { PlansRepository } from './plans.repository.js'

const OWN_VOICE_PERK = 'Documents read in your own voice'

export class PlansService {
  constructor(private readonly plansRepository: PlansRepository) {}

  /**
   * Every plan with the allowances this user would get, and their current one
   * marked. Before they've bought anything, their phone's time zone stands in
   * for the store country, so a listener in Bangladesh sees what ৳149 buys there.
   */
  async list(userId: string) {
    const user = await this.plansRepository.findUserPlan(userId)
    const region = rewardRegionFor(user?.billingCountry, user?.timeZone)
    // Not promised where a voice can't be made from a recording
    const ownVoice = !ownVoiceBlockedIn(user?.billingCountry, user?.timeZone)
    return {
      current: planFor(user?.plan).id,
      /** Purchases work on the server; the app still needs the store's products to sell */
      billingEnabled: billingConfigured(),
      plans: PLANS.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        ...p.allowances[region],
        monthlyTranslateChars: p.allowances[region].translateChars,
        perks: p.id === OWN_VOICE_PLAN && ownVoice ? [...p.perks, OWN_VOICE_PERK] : p.perks,
      })),
    }
  }
}
