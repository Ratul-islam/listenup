import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { StudioController } from './studio.controller.js'
import { StudioRepository } from './studio.repository.js'
import { postBodySchema, studioParamsSchema, studioSettingsSchema } from './studio.schema.js'
import { StudioService } from './studio.service.js'

// A script's settings live under its document: /documents/:documentId/studio
export const autoPrefix = '/documents'

const studioRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new StudioController(new StudioService(new StudioRepository(prisma)))

  app.addHook('preHandler', app.verifyAccess)

  // The platform, narration type, tone, speed and pitch; parts whose audio changes are voiced again
  app.patch(
    '/:documentId/studio',
    { schema: { params: studioParamsSchema, body: studioSettingsSchema }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    controller.update,
  )
  // The caption, hashtags and title to post with the video, for a platform
  app.post(
    '/:documentId/post',
    { schema: { params: studioParamsSchema, body: postBodySchema }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    controller.writePost,
  )
}

export default studioRoutes
