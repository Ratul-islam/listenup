import { buildApp } from './application.js'
import { env } from './config/env.js'

/** HTTP API. Listens on $PORT (Vercel and most hosts set it) and shuts down cleanly when the host stops it. */
const app = await buildApp()

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal}: closing`)
    // Hosts give ~30s after SIGTERM; finish in-flight requests, release DB connections
    void app.close().then(() => process.exit(0))
  })
}
