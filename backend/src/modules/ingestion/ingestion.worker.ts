import { prisma } from '../../config/db.js'
import type { JobWithMetadata } from 'pg-boss'
import { queue, QUEUES, type ProcessDocumentJob } from '../../lib/queue.js'
import { DocumentsRepository } from '../documents/documents.repository.js'
import { IngestionService } from './ingestion.service.js'

/** Consumes document.process jobs */
export async function startIngestionWorker() {
  const ingestion = new IngestionService(new DocumentsRepository(prisma))

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
}
