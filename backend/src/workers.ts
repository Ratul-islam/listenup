import { startBillingWorker } from './modules/billing/billing.worker.js'
import { startCommunityWorker } from './modules/community/community.worker.js'
import { startExportsWorker } from './modules/exports/exports.worker.js'
import { startExpressionsWorker } from './modules/expressions/expressions.worker.js'
import { startIngestionWorker } from './modules/ingestion/ingestion.worker.js'
import { startOwnVoiceWorker } from './modules/own-voice/own-voice.worker.js'
import { startTtsWorker } from './modules/tts/tts.worker.js'
import { startUsersWorker } from './modules/users/users.worker.js'
import { startVoiceTranslationWorker } from './modules/voice-translation/voice-translation.worker.js'

/**
 * Every queue consumer: imports, AI emotions, MP3 exports, lapsed-plan checks, Explore's
 * Community (checking new publications, contest prizes), the daily purges of closed
 * accounts and unused audio, the yearly renewal of listeners' own voices, and voice translations
 */
export async function startWorkers() {
  await startIngestionWorker()
  await startExpressionsWorker()
  await startUsersWorker()
  await startExportsWorker()
  await startTtsWorker()
  await startBillingWorker()
  await startCommunityWorker()
  await startOwnVoiceWorker()
  await startVoiceTranslationWorker()
}
