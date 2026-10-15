import type { JobWithMetadata } from 'pg-boss'
import { prisma } from '../../config/db.js'
import { queue, QUEUES, type VoiceTranslationJob } from '../../lib/queue.js'
import { VoiceTranslationRepository } from './voice-translation.repository.js'
import { VoiceTranslationService } from './voice-translation.service.js'

/** Hears and translates uploaded recordings, one at a time per process (each is a long listen) */
export async function startVoiceTranslationWorker() {
  const service = new VoiceTranslationService(new VoiceTranslationRepository(prisma))

  await queue.work(QUEUES.voiceTranslation, { includeMetadata: true, batchSize: 1, localConcurrency: 1 }, async ([job]: JobWithMetadata<VoiceTranslationJob>[]) => {
    await service.process(job.data.documentId, { finalAttempt: job.retryCount >= job.retryLimit })
  })
}
