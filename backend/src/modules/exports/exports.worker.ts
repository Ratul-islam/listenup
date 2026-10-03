import type { JobWithMetadata } from 'pg-boss'
import { queue, QUEUES, type ExportAudioJob } from '../../lib/queue.js'
import { AppError } from '../../utils/AppError.js'
import { createExportsService } from './exports.factory.js'

/** Builds MP3 exports. Out-of-allowance fails at once; other errors retry (voiced chunks are kept). */
export async function startExportsWorker() {
  const exports = createExportsService()

  await queue.work(
    QUEUES.exportAudio,
    { includeMetadata: true, batchSize: 1, localConcurrency: 1 },
    async ([job]: JobWithMetadata<ExportAudioJob>[]) => {
      const { documentId, jobId, voiceId } = job.data
      try {
        await exports.run(documentId, jobId, voiceId)
      } catch (e) {
        console.error(`[exports] ${documentId} failed`, e)
        const final = job.retryCount >= job.retryLimit || (e instanceof AppError && e.code === 'USAGE_LIMIT_REACHED')
        if (final) await exports.fail(documentId, jobId, e)
        else throw e
      }
    },
  )
}
