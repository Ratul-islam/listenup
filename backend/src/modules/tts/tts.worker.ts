import { queue, QUEUES } from '../../lib/queue.js'
import { createTtsService } from './tts.factory.js'

/** Removes shared audio files nothing plays any more, daily at 03:30 */
export async function startTtsWorker() {
  const tts = createTtsService()
  await queue.schedule(QUEUES.purgeOrphanAudio, '30 3 * * *')
  await queue.work(QUEUES.purgeOrphanAudio, async () => {
    const removed = await tts.purgeOrphanBlobs()
    if (removed) console.log(`[tts] removed ${removed} unused audio files`)
  })
}
