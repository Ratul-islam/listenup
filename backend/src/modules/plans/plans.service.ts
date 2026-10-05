import { billingConfigured } from '../../lib/revenuecat.js'
import { planFor, PLANS, regionFor } from './plan-catalog.js'
import type { PlansRepository } from './plans.repository.js'

export class PlansService {
  constructor(private readonly plansRepository: PlansRepository) {}

  /** Every plan with the allowances this user would get, and their current one marked */
  async list(userId: string) {
    const user = await this.plansRepository.findUserPlan(userId)
    const region = regionFor(user?.billingCountry)
    return {
      current: planFor(user?.plan).id,
      /** Purchases work on the server; the app still needs the store's products to sell */
      billingEnabled: billingConfigured(),
      plans: PLANS.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        ...p.allowances[region],
        monthlyTranslateChars: p.monthlyTranslateChars,
        perks: p.perks,
      })),
    }
  }
}
