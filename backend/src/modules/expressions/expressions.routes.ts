import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { createUsageService } from '../usage/usage.factory.js'
import { ExpressionsController } from './expressions.controller.js'
import { ExpressionsRepository } from './expressions.repository.js'
import {
  castBodySchema,
  chunkParamsSchema,
  clearQuerySchema,
  deliveryBodySchema,
  describeBodySchema,
  documentParamsSchema,
  narrationBodySchema,
} from './expressions.schema.js'
import { ExpressionsService } from './expressions.service.js'

// A recording of a line as base64 in a JSON body
const DELIVERY_BODY_LIMIT = 4 * 1024 * 1024

// Lives under its document: /documents/:documentId/narration, /expressive, /expressions, /cast.
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
  // "Say it yourself": a recording of the line, listened to once by AI and not kept
  app.post(
    '/:documentId/parts/:index/delivery',
    { schema: { params: chunkParamsSchema, body: deliveryBodySchema }, bodyLimit: DELIVERY_BODY_LIMIT, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    controller.follow,
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
  // A character's voice, and going back to one voice for everything
  app.put('/:documentId/cast', { schema: { params: documentParamsSchema, body: castBodySchema }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, controller.setCastVoice)
  app.delete('/:documentId/cast', { schema: { params: documentParamsSchema } }, controller.removeCast)
  app.delete('/:documentId/expressions', { schema: { params: documentParamsSchema, querystring: clearQuerySchema } }, controller.clear)
}

export default expressionsRoutes
