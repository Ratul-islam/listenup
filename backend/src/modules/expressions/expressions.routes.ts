import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { ExpressionsController } from './expressions.controller.js'
import { ExpressionsRepository } from './expressions.repository.js'
import { chunkExpressionsBodySchema, chunkParamsSchema, clearQuerySchema, documentParamsSchema } from './expressions.schema.js'
import { ExpressionsService } from './expressions.service.js'

const expressionsRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new ExpressionsController(new ExpressionsService(new ExpressionsRepository(prisma)))

  app.addHook('preHandler', app.verifyAccess)

  app.put(
    '/:documentId/chunks/:index',
    { schema: { params: chunkParamsSchema, body: chunkExpressionsBodySchema }, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    controller.setChunk,
  )
  app.post(
    '/:documentId/auto',
    { schema: { params: documentParamsSchema }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    controller.startAuto,
  )
  app.delete('/:documentId', { schema: { params: documentParamsSchema, querystring: clearQuerySchema } }, controller.clear)
}

export default expressionsRoutes
