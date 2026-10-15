import { PgBoss } from 'pg-boss'
import { env } from '../config/env.js'

/**
 * Background jobs stored in Postgres (schema "pgboss"), so no extra infrastructure is needed.
 * An API-only process (RUN_WORKERS=false) just sends jobs; maintenance and cron schedules
 * run in the worker process.
 */
export const queue = new PgBoss({
  connectionString: env.DATABASE_URL,
  schema: 'pgboss',
  supervise: env.RUN_WORKERS,
  schedule: env.RUN_WORKERS,
  // An API-only process just sends jobs
  max: env.RUN_WORKERS ? env.QUEUE_POOL_MAX : 1,
})

export const QUEUES = {
  processDocument: 'document.process',
  autoExpression: 'document.auto-expression',
  purgeClosedAccounts: 'users.purge-closed',
  exportAudio: 'document.export-audio',
  purgeOrphanAudio: 'audio.purge-orphans',
  expirePlans: 'billing.expire-plans',
  translateDocument: 'document.translate',
  prepareOffline: 'document.prepare-offline',
  publishCommunity: 'community.publish',
  settleContests: 'community.settle-contests',
  renewOwnVoices: 'own-voice.renew',
  voiceTranslation: 'voice.translate',
} as const

// Translating a whole book can take a while. Exports and downloads run in 10-minute steps
// (plus joining), so half an hour is plenty for one.
const EXPIRE_SECONDS: Partial<Record<(typeof QUEUES)[keyof typeof QUEUES], number>> = {
  [QUEUES.exportAudio]: 30 * 60,
  [QUEUES.translateDocument]: 60 * 60,
  [QUEUES.prepareOffline]: 30 * 60,
  // A long writing is voiced in full when it's published
  [QUEUES.publishCommunity]: 30 * 60,
  // Ten minutes of speech heard and translated in one request
  [QUEUES.voiceTranslation]: 15 * 60,
}
// Their workers also say they're alive every half minute, so a job whose process died (a
// deploy, a crash) is retried within a couple of minutes, carrying on from the parts voiced
const HEARTBEAT_SECONDS: Partial<Record<(typeof QUEUES)[keyof typeof QUEUES], number>> = {
  [QUEUES.exportAudio]: 60,
  [QUEUES.prepareOffline]: 60,
}

export interface ProcessDocumentJob {
  documentId: string
  /** Skip text extraction and read the file with OCR */
  forceOcr?: boolean
}

export interface ExportAudioJob {
  documentId: string
  /** Matches AudioExport.jobId while this is the latest export of the document */
  jobId: string
  /** The voice the listener picked for this document, if any */
  voiceId?: string
}

export interface PrepareOfflineJob {
  documentId: string
  /** Matches OfflineDownload.jobId while this is the latest download of the document */
  jobId: string
  voiceId?: string
}

export interface TranslateDocumentJob {
  /** The new, translated document (filled in by the job) */
  documentId: string
  sourceId: string
  language: string
}

export interface PublishCommunityJob {
  publicationId: string
  /** Restored by the ListenUp team after the AI check wrongly turned it down */
  skipCheck?: boolean
}

export interface VoiceTranslationJob {
  documentId: string
}

export interface AutoExpressionJob {
  documentId: string
}

let started: Promise<void> | undefined

const LIVE_STATES = new Set(['created', 'retry', 'active'])

/**
 * Whether a job sent with this singleton key is waiting, running or due a retry.
 * A job whose process died stays "active" until it expires, then retries or fails.
 */
export async function hasLiveJob(name: (typeof QUEUES)[keyof typeof QUEUES], key: string) {
  await startQueue()
  return (await queue.findJobs(name, { key })).some((j) => LIVE_STATES.has(j.state))
}

export function startQueue() {
  started ??= (async () => {
    await queue.start()
    for (const name of Object.values(QUEUES)) {
      const expireInSeconds = EXPIRE_SECONDS[name] ?? 15 * 60
      const heartbeatSeconds = HEARTBEAT_SECONDS[name]
      await queue.createQueue(name, { retryLimit: 2, retryDelay: 10, retryBackoff: true, expireInSeconds, ...(heartbeatSeconds && { heartbeatSeconds }) })
      // A queue made earlier keeps the limits it was made with; bring them up to date
      await queue.updateQueue(name, { expireInSeconds, heartbeatSeconds: heartbeatSeconds ?? null })
    }
  })()
  return started
}
