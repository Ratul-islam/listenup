import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { OwnVoiceController } from './own-voice.controller.js'
import { createOwnVoiceService } from './own-voice.factory.js'
import { recordBodySchema } from './own-voice.schema.js'

// Two recordings as base64 in one JSON body
const RECORD_BODY_LIMIT = 9 * 1024 * 1024

const ownVoiceRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new OwnVoiceController(createOwnVoiceService())

  app.addHook('preHandler', app.verifyAccess)

  app.get('/', controller.get)
  // Recordings that reach Google are counted per month in the service; this only keeps conversions from piling up
  app.post('/', { schema: { body: recordBodySchema }, bodyLimit: RECORD_BODY_LIMIT, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, controller.record)
  app.delete('/', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, controller.remove)
}

export default ownVoiceRoutes
