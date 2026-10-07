import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { createTtsService } from '../tts/tts.factory.js'
import { VoicesRepository } from '../voices/voices.repository.js'
import { VoicesService } from '../voices/voices.service.js'
import { PronunciationsController } from './pronunciations.controller.js'
import { PronunciationsRepository } from './pronunciations.repository.js'
import { previewBodySchema, pronunciationBodySchema, pronunciationParamsSchema, pronunciationUpdateSchema } from './pronunciations.schema.js'
import { PronunciationsService } from './pronunciations.service.js'

const pronunciationsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new PronunciationsService(new PronunciationsRepository(prisma), new VoicesService(new VoicesRepository(prisma)), createTtsService())
  const controller = new PronunciationsController(service)

  app.addHook('preHandler', app.verifyAccess)

  app.get('/', controller.list)
  // Adds a word, or changes how an existing one is said
  app.post('/', { schema: { body: pronunciationBodySchema }, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, controller.save)
  app.patch('/:id', { schema: { params: pronunciationParamsSchema, body: pronunciationUpdateSchema } }, controller.update)
  app.delete('/:id', { schema: { params: pronunciationParamsSchema } }, controller.remove)
  app.post('/preview', { schema: { body: previewBodySchema }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, controller.preview)
}

export default pronunciationsRoutes
