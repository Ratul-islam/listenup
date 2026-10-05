import type { JobWithMetadata } from 'pg-boss'
import { prisma } from '../../config/db.js'
import { queue, QUEUES, type AutoExpressionJob } from '../../lib/queue.js'
import { createUsageService } from '../usage/usage.factory.js'
import { ExpressionsRepository } from './expressions.repository.js'
import { ExpressionsService } from './expressions.service.js'

/** Consumes "Make it expressive" jobs */
export async function startExpressionsWorker() {
  const service = new ExpressionsService(new ExpressionsRepository(prisma), createUsageService())

  await queue.work(
    QUEUES.autoExpression,
    { includeMetadata: true, batchSize: 1, localConcurrency: 2 },
    async ([job]: JobWithMetadata<AutoExpressionJob>[]) => {
      try {
        await service.runAuto(job.data.documentId)
      } catch (e) {
        console.error(`[expressions] auto for ${job.data.documentId} failed`, e)
        if (job.retryCount >= job.retryLimit) await service.failAuto(job.data.documentId)
        throw e
      }
    },
  )
}
