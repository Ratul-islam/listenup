import { queue, QUEUES } from '../../lib/queue.js'
import { createOwnVoiceService } from './own-voice.factory.js'

/** Daily at 04:00: makes own voices again before Google's year is up, and clears audio left by deleted ones */
export async function startOwnVoiceWorker() {
  const ownVoices = createOwnVoiceService()
  await queue.schedule(QUEUES.renewOwnVoices, '0 4 * * *')
  await queue.work(QUEUES.renewOwnVoices, async () => {
    const renewed = await ownVoices.renewDue()
    if (renewed) console.log(`[own-voice] renewed ${renewed} voices`)
    const stray = await ownVoices.sweepStrayAudio()
    if (stray) console.log(`[own-voice] removed ${stray} clips of deleted voices`)
  })
}
