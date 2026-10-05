import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { createUsageService } from '../usage/usage.factory.js'
import { ExpressionsController } from './expressions.controller.js'
import { ExpressionsRepository } from './expressions.repository.js'
import {
  chunkExpressionsBodySchema,
  chunkParamsSchema,
  clearQuerySchema,
  describeBodySchema,
  documentParamsSchema,
  narrationBodySchema,
} from './expressions.schema.js'
import { ExpressionsService } from './expressions.service.js'

const expressionsRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new ExpressionsController(new ExpressionsService(new ExpressionsRepository(prisma), createUsageService()))

  app.addHook('preHandler', app.verifyAccess)

  app.put(
    '/:documentId/chunks/:index',
    { schema: { params: chunkParamsSchema, body: chunkExpressionsBodySchema }, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    controller.setChunk,
  )
  // One small AI request each; the limit keeps a free account from looping it
  app.post(
    '/:documentId/chunks/:index/describe',
    { schema: { params: chunkParamsSchema, body: describeBodySchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.describe,
  )
  app.put(
    '/:documentId/narration',
    { schema: { params: documentParamsSchema, body: narrationBodySchema }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    controller.setNarration,
  )
  app.post(
    '/:documentId/auto',
    { schema: { params: documentParamsSchema, body: narrationBodySchema }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    controller.startAuto,
  )
  app.delete('/:documentId', { schema: { params: documentParamsSchema, querystring: clearQuerySchema } }, controller.clear)
}

export default expressionsRoutes
