import { connectDB, disconnectDB } from './config/db.js'
import { env, ttsProviderName } from './config/env.js'
import { queue, startQueue } from './lib/queue.js'
import { startWorkers } from './workers.js'

/**
 * Background jobs only, no HTTP: imports, AI emotions, MP3 exports and the
 * daily purge. Run one always-on copy next to an API that has RUN_WORKERS=false.
 */
if (!env.RUN_WORKERS) throw new Error('The worker needs RUN_WORKERS=true')

await connectDB()
await startQueue()
await startWorkers()
console.log(`Worker running (speech provider: ${ttsProviderName})`)

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    console.log(`${signal}: finishing current jobs`)
    void queue
      .stop({ graceful: true, timeout: 25_000 })
      .then(disconnectDB)
      .then(() => process.exit(0))
  })
}
