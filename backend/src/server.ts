import { buildApp } from './application.js'

const app = await buildApp()

if (process.env.NODE_ENV !== 'production') {
  const PORT = 8000
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`Server started at ${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

export default async function handler(req:  any, res: any) {
  await app.ready()
  app.server.emit('request', req, res)
}