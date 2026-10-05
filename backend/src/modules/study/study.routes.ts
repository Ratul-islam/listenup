import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { StudyController } from './study.controller.js'
import { StudyRepository } from './study.repository.js'
import { studyParamsSchema } from './study.schema.js'
import { StudyService } from './study.service.js'

const studyLimit = { rateLimit: { max: 15, timeWindow: '1 minute' } }

const studyRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new StudyController(new StudyService(new StudyRepository(prisma)))
  app.addHook('preHandler', app.verifyAccess)

  app.get('/:documentId/:kind', { schema: { params: studyParamsSchema }, config: studyLimit }, controller.get)
  app.post('/:documentId/:kind/refresh', { schema: { params: studyParamsSchema }, config: studyLimit }, controller.refresh)
}

export default studyRoutes
