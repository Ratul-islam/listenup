import { listeningHours, planFor, PLANS } from './plan-catalog.js'
import type { PlansRepository } from './plans.repository.js'

export class PlansService {
  constructor(private readonly plansRepository: PlansRepository) {}

  /** Every plan, with the user's current one marked */
  async list(userId: string) {
    const current = planFor((await this.plansRepository.findUserPlan(userId))?.plan).id
    return {
      current,
      plans: PLANS.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        monthlyHours: listeningHours(p.monthlyChars),
        perks: p.perks,
        purchasable: p.purchasable,
      })),
    }
  }
}
