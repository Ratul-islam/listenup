import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { PartsController } from './parts.controller.js'
import { PartsRepository } from './parts.repository.js'
import { VoicesRepository } from '../voices/voices.repository.js'
import { VoicesService } from '../voices/voices.service.js'
import { documentParamsSchema, editPartBodySchema, insertPartBodySchema, partParamsSchema, replaceBodySchema, sentenceParamsSchema } from './parts.schema.js'
import { PartsService } from './parts.service.js'

// Lives under its document: /documents/:documentId/parts
export const autoPrefix = '/documents'

const editLimit = { rateLimit: { max: 60, timeWindow: '1 minute' } }

const partsRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new PartsController(new PartsService(new PartsRepository(prisma), new VoicesService(new VoicesRepository(prisma))))

  app.addHook('preHandler', app.verifyAccess)

  app.post('/:documentId/parts', { schema: { params: documentParamsSchema, body: insertPartBodySchema }, config: editLimit }, controller.insert)
  // New words and/or emotions for one part; only that part is voiced again
  app.patch('/:documentId/parts/:index', { schema: { params: partParamsSchema, body: editPartBodySchema }, config: editLimit }, controller.edit)
  app.delete('/:documentId/parts/:index', { schema: { params: partParamsSchema }, config: editLimit }, controller.remove)
  // "Redo this sentence": only that sentence is recorded again and spliced in
  app.post(
    '/:documentId/parts/:index/sentences/:sentence/retake',
    { schema: { params: sentenceParamsSchema }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    controller.retakeSentence,
  )
  // Find and replace across the script (a preview unless `apply`)
  app.post('/:documentId/replace', { schema: { params: documentParamsSchema, body: replaceBodySchema }, config: editLimit }, controller.replace)
  app.post('/:documentId/parts/:index/retake', { schema: { params: partParamsSchema }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, controller.retake)
}

export default partsRoutes
