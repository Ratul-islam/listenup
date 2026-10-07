import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { createUsageService } from '../usage/usage.factory.js'
import { ExpressionsController } from './expressions.controller.js'
import { ExpressionsRepository } from './expressions.repository.js'
import {
  chunkParamsSchema,
  clearQuerySchema,
  describeBodySchema,
  documentParamsSchema,
  narrationBodySchema,
} from './expressions.schema.js'
import { ExpressionsService } from './expressions.service.js'

// Lives under its document: /documents/:documentId/narration, /expressive, /expressions.
// A part's own emotions are set with PATCH /documents/:documentId/parts/:index (parts module).
export const autoPrefix = '/documents'

const expressionsRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new ExpressionsController(new ExpressionsService(new ExpressionsRepository(prisma), createUsageService()))

  app.addHook('preHandler', app.verifyAccess)

  // "Say it like a scared child": one small AI request each; the limit keeps a free account from looping it
  app.post(
    '/:documentId/parts/:index/direction',
    { schema: { params: chunkParamsSchema, body: describeBodySchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.describe,
  )
  app.put(
    '/:documentId/narration',
    { schema: { params: documentParamsSchema, body: narrationBodySchema }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    controller.setNarration,
  )
  // "Make it expressive"
  app.post(
    '/:documentId/expressive',
    { schema: { params: documentParamsSchema, body: narrationBodySchema }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    controller.startAuto,
  )
  app.delete('/:documentId/expressions', { schema: { params: documentParamsSchema, querystring: clearQuerySchema } }, controller.clear)
}

export default expressionsRoutes
