import { prisma } from '../../config/db.js'
import { BudgetService } from './budget.service.js'
import { UsageRepository } from './usage.repository.js'
import { UsageService } from './usage.service.js'

// One per process, so every service sees the same in-memory spend totals
let budget: BudgetService | undefined

export function createUsageService() {
  const repository = new UsageRepository(prisma)
  budget ??= new BudgetService(repository)
  return new UsageService(repository, budget)
}
