import { startExportsWorker } from './modules/exports/exports.worker.js'
import { startExpressionsWorker } from './modules/expressions/expressions.worker.js'
import { startIngestionWorker } from './modules/ingestion/ingestion.worker.js'
import { startUsersWorker } from './modules/users/users.worker.js'

/** Every queue consumer: imports, AI emotions, MP3 exports, and the daily purge of closed accounts */
export async function startWorkers() {
  await startIngestionWorker()
  await startExpressionsWorker()
  await startUsersWorker()
  await startExportsWorker()
}
