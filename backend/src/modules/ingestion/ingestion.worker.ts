import { prisma } from '../../config/db.js'
import type { JobResult, JobWithMetadata } from 'pg-boss'
import { queue, QUEUES, type ProcessDocumentJob, type TranslateDocumentJob } from '../../lib/queue.js'
import { DocumentsRepository } from '../documents/documents.repository.js'
import { createUsageService } from '../usage/usage.factory.js'
import { IngestionService } from './ingestion.service.js'
import type { Lang } from './text/language.js'
import { TranslationService } from './translation.service.js'

// Import jobs fetched at once per worker (each still runs on its own)
const IMPORT_BATCH = 8

/** Consumes document.process (imports) and document.translate jobs */
export async function startIngestionWorker() {
  const documents = new DocumentsRepository(prisma)
  const ingestion = new IngestionService(documents)
  const translation = new TranslationService(documents, ingestion, createUsageService())

  // Imports come in bursts (a creator pasting several scripts, many users at once), but each
  // takes only tens of milliseconds. Fetching one job per 2-second poll capped imports at about
  // one a second (load test, Oct 2026: 300 at once took 5 minutes). Each worker now takes up to
  // IMPORT_BATCH jobs per fetch and keeps fetching while batches come back full; jobs still run
  // one at a time, and each is completed or failed (and retried) on its own.
  await queue.work(
    QUEUES.processDocument,
    { includeMetadata: true, batchSize: IMPORT_BATCH, localConcurrency: 2, burstWhenBatchFull: true, perJobResults: true },
    async (jobs: JobWithMetadata<ProcessDocumentJob>[]) => {
      const results: JobResult[] = []
      for (const job of jobs) {
        try {
          await ingestion.process(job.data.documentId, {
            forceOcr: job.data.forceOcr,
            finalAttempt: job.retryCount >= job.retryLimit,
          })
          results.push({ id: job.id, status: 'completed' })
        } catch (e) {
          console.error(`[ingestion] ${job.data.documentId} failed`, e)
          results.push({ id: job.id, status: 'failed', output: { message: e instanceof Error ? e.message : String(e) } })
        }
      }
      return results
    },
  )

  await queue.work(
    QUEUES.translateDocument,
    { includeMetadata: true, batchSize: 1, localConcurrency: 1 },
    async ([job]: JobWithMetadata<TranslateDocumentJob>[]) => {
      const { documentId, sourceId, language } = job.data
      await translation.run(documentId, sourceId, language as Lang, { finalAttempt: job.retryCount >= job.retryLimit })
    },
  )
}
