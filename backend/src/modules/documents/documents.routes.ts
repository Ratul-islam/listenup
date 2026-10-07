import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { createUsageService } from '../usage/usage.factory.js'
import { VoicesRepository } from '../voices/voices.repository.js'
import { VoicesService } from '../voices/voices.service.js'
import { DocumentsController } from './documents.controller.js'
import { DocumentsRepository } from './documents.repository.js'
import {
  createBodySchema,
  idParamsSchema,
  listQuerySchema,
  reprocessBodySchema,
  scriptQuerySchema,
  translateBodySchema,
  updateBodySchema,
  uploadStartSchema,
} from './documents.schema.js'
import { DocumentsService } from './documents.service.js'

const importLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } }

/**
 * Documents and scripts. Everything about one document lives under
 * /documents/:id: its parts (parts module), emotions (expressions), listening
 * (playback), MP3 and offline audio (exports) and study aids (study).
 */
const documentsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new DocumentsService(new DocumentsRepository(prisma), new VoicesService(new VoicesRepository(prisma)), createUsageService())
  const controller = new DocumentsController(service)

  app.addHook('preHandler', app.verifyAccess)

  app.get('/', { schema: { querystring: listQuerySchema } }, controller.list)
  // Pasted text, a link, an uploaded file ({ from: 'upload', uploadId }) or today's digest
  app.post('/', { schema: { body: createBodySchema }, config: importLimit }, controller.create)
  // Files go straight to storage: get a signed link, PUT the file, then POST / with from: 'upload'
  app.post('/uploads', { schema: { body: uploadStartSchema }, config: importLimit }, controller.startUpload)
  app.get('/:id', { schema: { params: idParamsSchema } }, controller.get)
  app.patch('/:id', { schema: { params: idParamsSchema, body: updateBodySchema } }, controller.update)
  app.delete('/:id', { schema: { params: idParamsSchema } }, controller.remove)
  app.get('/:id/script', { schema: { params: idParamsSchema, querystring: scriptQuerySchema } }, controller.script)
  app.post('/:id/reprocess', { schema: { params: idParamsSchema, body: reprocessBodySchema }, config: importLimit }, controller.reprocess)
  app.post('/:id/translations', { schema: { params: idParamsSchema, body: translateBodySchema }, config: importLimit }, controller.translate)
}

export default documentsRoutes
