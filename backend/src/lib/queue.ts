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
  max: env.RUN_WORKERS ? 10 : 2,
})

export const QUEUES = {
  processDocument: 'document.process',
  autoExpression: 'document.auto-expression',
  purgeClosedAccounts: 'users.purge-closed',
  exportAudio: 'document.export-audio',
} as const

// Voicing a whole book can take a while
const EXPIRE_SECONDS: Partial<Record<(typeof QUEUES)[keyof typeof QUEUES], number>> = {
  [QUEUES.exportAudio]: 3 * 60 * 60,
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

export interface AutoExpressionJob {
  documentId: string
}

let started: Promise<void> | undefined

export function startQueue() {
  started ??= (async () => {
    await queue.start()
    for (const name of Object.values(QUEUES)) {
      await queue.createQueue(name, { retryLimit: 2, retryDelay: 10, retryBackoff: true, expireInSeconds: EXPIRE_SECONDS[name] ?? 15 * 60 })
    }
  })()
  return started
}
