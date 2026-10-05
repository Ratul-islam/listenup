import { prisma } from '../../config/db.js'
import { BillingRepository } from './billing.repository.js'
import { BillingService } from './billing.service.js'

/** Shared by the routes and the worker */
export function createBillingService() {
  return new BillingService(new BillingRepository(prisma))
}
