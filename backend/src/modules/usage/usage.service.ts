import { AppError } from '../../utils/AppError.js'
import { planFor } from '../plans/plan-catalog.js'
import type { UsageRepository } from './usage.repository.js'

const currentPeriod = () => new Date().toISOString().slice(0, 7)

/** Monthly speech allowance from the user's plan: characters sent to the speech provider */
export class UsageService {
  constructor(private readonly usageRepository: UsageRepository) {}

  async summary(userId: string) {
    const period = currentPeriod()
    const [month, user] = await Promise.all([this.usageRepository.find(userId, period), this.usageRepository.findUserPlan(userId)])
    const plan = planFor(user?.plan)
    const used = month?.characters ?? 0
    const limit = plan.monthlyChars
    return {
      period,
      plan: { id: plan.id, name: plan.name },
      usedCharacters: used,
      limitCharacters: limit,
      remainingCharacters: Math.max(limit - used, 0),
    }
  }

  async assertAvailable(userId: string, characters: number) {
    const { remainingCharacters } = await this.summary(userId)
    if (characters > remainingCharacters) {
      throw new AppError(
        "You've used this month's listening allowance. It resets on the 1st.",
        402,
        'USAGE_LIMIT_REACHED',
      )
    }
  }

  async record(userId: string, characters: number) {
    await this.usageRepository.add(userId, currentPeriod(), characters)
  }
}
