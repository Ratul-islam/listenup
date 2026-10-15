import { prisma } from '../../config/db.js'
import { setTextSpendGuard } from '../../lib/openrouter.js'
import { BudgetService } from './budget.service.js'
import { textSpendGuard } from './text-spend.js'
import { UsageRepository } from './usage.repository.js'
import { UsageService } from './usage.service.js'

// One per process, so every service sees the same in-memory spend totals
let budget: BudgetService | undefined

export function createUsageService() {
  const repository = new UsageRepository(prisma)
  if (!budget) {
    budget = new BudgetService(repository)
    // Text AI shares the caps with speech
    setTextSpendGuard(textSpendGuard(budget, repository))
  }
  return new UsageService(repository, budget)
}
