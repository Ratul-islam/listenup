import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { createTtsService } from '../tts/tts.factory.js'
import { VoicesRepository } from '../voices/voices.repository.js'
import { VoicesService } from '../voices/voices.service.js'
import { PlaybackController } from './playback.controller.js'
import { PlaybackRepository } from './playback.repository.js'
import { statsQuerySchema } from './playback.schema.js'
import { PlaybackService } from './playback.service.js'

// Listening across every document: /listening/stats
export const autoPrefix = '/listening'

const listeningRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new PlaybackController(new PlaybackService(new PlaybackRepository(prisma), new VoicesService(new VoicesRepository(prisma)), createTtsService()))

  app.addHook('preHandler', app.verifyAccess)

  app.get('/stats', { schema: { querystring: statsQuerySchema } }, controller.stats)
}

export default listeningRoutes
