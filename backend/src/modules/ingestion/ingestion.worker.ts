import { prisma } from '../../config/db.js'
import type { JobWithMetadata } from 'pg-boss'
import { queue, QUEUES, type ProcessDocumentJob, type TranslateDocumentJob } from '../../lib/queue.js'
import { DocumentsRepository } from '../documents/documents.repository.js'
import { createUsageService } from '../usage/usage.factory.js'
import { IngestionService } from './ingestion.service.js'
import type { Lang } from './text/language.js'
import { TranslationService } from './translation.service.js'

/** Consumes document.process (imports) and document.translate jobs */
export async function startIngestionWorker() {
  const documents = new DocumentsRepository(prisma)
  const ingestion = new IngestionService(documents)
  const translation = new TranslationService(documents, ingestion, createUsageService())

  await queue.work(
    QUEUES.processDocument,
    { includeMetadata: true, batchSize: 1, localConcurrency: 2 },
    async ([job]: JobWithMetadata<ProcessDocumentJob>[]) => {
      await ingestion.process(job.data.documentId, {
        forceOcr: job.data.forceOcr,
        finalAttempt: job.retryCount >= job.retryLimit,
      })
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
