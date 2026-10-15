import type { JobWithMetadata } from 'pg-boss'
import { queue, QUEUES, type PublishCommunityJob } from '../../lib/queue.js'
import { createCommunityServices } from './community.factory.js'

/** Checks and voices new publications; hourly, gives the prizes of contest months that have ended */
export async function startCommunityWorker() {
  const { community, contest } = createCommunityServices()

  await queue.work(
    QUEUES.publishCommunity,
    { includeMetadata: true, batchSize: 1, localConcurrency: 2 },
    async ([job]: JobWithMetadata<PublishCommunityJob>[]) => {
      try {
        await community.process(job.data)
      } catch (e) {
        console.error(`[community] ${job.data.publicationId} failed`, e)
        // Out of tries: the writer can try again from the app
        if (job.retryCount >= job.retryLimit) await community.giveUp(job.data.publicationId)
        else throw e
      }
    },
  )

  await queue.schedule(QUEUES.settleContests, '5 * * * *')
  await queue.work(QUEUES.settleContests, async () => {
    await contest.settleDue()
  })
}
