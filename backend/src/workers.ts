import { startBillingWorker } from './modules/billing/billing.worker.js'
import { startExportsWorker } from './modules/exports/exports.worker.js'
import { startExpressionsWorker } from './modules/expressions/expressions.worker.js'
import { startIngestionWorker } from './modules/ingestion/ingestion.worker.js'
import { startTtsWorker } from './modules/tts/tts.worker.js'
import { startUsersWorker } from './modules/users/users.worker.js'

/** Every queue consumer: imports, AI emotions, MP3 exports, lapsed-plan checks, and the daily purges of closed accounts and unused audio */
export async function startWorkers() {
  await startIngestionWorker()
  await startExpressionsWorker()
  await startUsersWorker()
  await startExportsWorker()
  await startTtsWorker()
  await startBillingWorker()
}
