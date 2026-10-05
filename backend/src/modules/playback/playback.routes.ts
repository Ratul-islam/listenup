import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { createInvitesService } from '../invites/invites.factory.js'
import { createTtsService } from '../tts/tts.factory.js'
import { VoicesRepository } from '../voices/voices.repository.js'
import { VoicesService } from '../voices/voices.service.js'
import { PlaybackController } from './playback.controller.js'
import { PlaybackRepository } from './playback.repository.js'
import {
  audioQuerySchema,
  bookmarkBodySchema,
  bookmarkParamsSchema,
  chunkParamsSchema,
  documentParamsSchema,
  progressBodySchema,
  statsQuerySchema,
  voiceNoteBodySchema,
} from './playback.schema.js'
import { PlaybackService } from './playback.service.js'

const playbackRoutes: FastifyPluginAsyncZod = async (app) => {
  const tts = createTtsService()
  const invites = createInvitesService()
  const service = new PlaybackService(new PlaybackRepository(prisma), new VoicesService(new VoicesRepository(prisma)), tts, (userId) =>
    invites.checkReward(userId),
  )
  const controller = new PlaybackController(service)

  app.addHook('preHandler', app.verifyAccess)

  app.get('/stats', { schema: { querystring: statsQuerySchema } }, controller.stats)
  app.get(
    '/:documentId/chunks/:index/audio',
    { schema: { params: chunkParamsSchema, querystring: audioQuerySchema }, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    controller.audio,
  )
  app.post(
    '/:documentId/voice-notes',
    { schema: { params: documentParamsSchema, body: voiceNoteBodySchema }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    controller.voiceNote,
  )
  app.put('/:documentId/progress', { schema: { params: documentParamsSchema, body: progressBodySchema } }, controller.saveProgress)
  app.get('/:documentId/bookmarks', { schema: { params: documentParamsSchema } }, controller.listBookmarks)
  app.post('/:documentId/bookmarks', { schema: { params: documentParamsSchema, body: bookmarkBodySchema } }, controller.addBookmark)
  app.delete('/:documentId/bookmarks/:bookmarkId', { schema: { params: bookmarkParamsSchema } }, controller.removeBookmark)
}

export default playbackRoutes
