import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { createTtsService } from '../tts/tts.factory.js'
import { VoicesController } from './voices.controller.js'
import { VoicesRepository } from './voices.repository.js'
import { preferencesBodySchema, voiceParamsSchema } from './voices.schema.js'
import { VoicesService } from './voices.service.js'

const voicesRoutes: FastifyPluginAsyncZod = async (app) => {
  const tts = createTtsService()
  const controller = new VoicesController(new VoicesService(new VoicesRepository(prisma)), tts)

  app.addHook('preHandler', app.verifyAccess)

  app.get('/', controller.list)
  app.get('/on-device', controller.onDeviceModel)
  app.put('/preferences', { schema: { body: preferencesBodySchema } }, controller.updatePreferences)
  app.get(
    '/:id/preview',
    { schema: { params: voiceParamsSchema }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    controller.preview,
  )
}

export default voicesRoutes
