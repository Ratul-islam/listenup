import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { createTtsProvider } from '../tts/providers/provider-factory.js'
import { TtsRepository } from '../tts/tts.repository.js'
import { TtsService } from '../tts/tts.service.js'
import { UsageRepository } from '../usage/usage.repository.js'
import { UsageService } from '../usage/usage.service.js'
import { VoicesController } from './voices.controller.js'
import { VoicesRepository } from './voices.repository.js'
import { preferencesBodySchema, voiceParamsSchema } from './voices.schema.js'
import { VoicesService } from './voices.service.js'

const voicesRoutes: FastifyPluginAsyncZod = async (app) => {
  const tts = new TtsService(new TtsRepository(prisma), new UsageService(new UsageRepository(prisma)), createTtsProvider())
  const controller = new VoicesController(new VoicesService(new VoicesRepository(prisma)), tts)

  app.addHook('preHandler', app.verifyAccess)

  app.get('/', controller.list)
  app.put('/preferences', { schema: { body: preferencesBodySchema } }, controller.updatePreferences)
  app.get(
    '/:id/preview',
    { schema: { params: voiceParamsSchema }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    controller.preview,
  )
}

export default voicesRoutes
