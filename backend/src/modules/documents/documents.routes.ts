import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { VoicesRepository } from '../voices/voices.repository.js'
import { VoicesService } from '../voices/voices.service.js'
import { DocumentsController } from './documents.controller.js'
import { DocumentsRepository } from './documents.repository.js'
import {
  idParamsSchema,
  listQuerySchema,
  readerQuerySchema,
  reprocessBodySchema,
  textBodySchema,
  updateBodySchema,
  urlBodySchema,
} from './documents.schema.js'
import { DocumentsService } from './documents.service.js'

const importLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } }

const documentsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new DocumentsService(new DocumentsRepository(prisma), new VoicesService(new VoicesRepository(prisma)))
  const controller = new DocumentsController(service)

  app.addHook('preHandler', app.verifyAccess)

  app.get('/', { schema: { querystring: listQuerySchema } }, controller.list)
  app.post('/upload', { config: importLimit }, controller.upload)
  app.post('/text', { schema: { body: textBodySchema }, config: importLimit }, controller.createFromText)
  app.post('/url', { schema: { body: urlBodySchema }, config: importLimit }, controller.createFromUrl)
  app.get('/:id', { schema: { params: idParamsSchema } }, controller.get)
  app.patch('/:id', { schema: { params: idParamsSchema, body: updateBodySchema } }, controller.update)
  app.delete('/:id', { schema: { params: idParamsSchema } }, controller.remove)
  app.post('/:id/reprocess', { schema: { params: idParamsSchema, body: reprocessBodySchema }, config: importLimit }, controller.reprocess)
  app.get('/:id/reader', { schema: { params: idParamsSchema, querystring: readerQuerySchema } }, controller.reader)
}

export default documentsRoutes
