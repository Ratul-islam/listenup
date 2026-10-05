import { queue, QUEUES } from '../../lib/queue.js'
import { createBillingService } from './billing.factory.js'

/** Re-checks paid plans whose period has ended, hourly (a safety net for missed webhooks) */
export async function startBillingWorker() {
  const billing = createBillingService()
  await queue.schedule(QUEUES.expirePlans, '15 * * * *')
  await queue.work(QUEUES.expirePlans, async () => {
    const checked = await billing.expireLapsedPlans()
    if (checked) console.log(`[billing] re-checked ${checked} lapsed plans`)
  })
}
