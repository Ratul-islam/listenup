import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { StudyController } from './study.controller.js'
import { StudyRepository } from './study.repository.js'
import { studyParamsSchema } from './study.schema.js'
import { StudyService } from './study.service.js'

const studyLimit = { rateLimit: { max: 15, timeWindow: '1 minute' } }

// Lives under its document: /documents/:documentId/study/summary and /quiz
export const autoPrefix = '/documents'

const studyRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new StudyController(new StudyService(new StudyRepository(prisma)))
  app.addHook('preHandler', app.verifyAccess)

  app.get('/:documentId/study/:kind', { schema: { params: studyParamsSchema }, config: studyLimit }, controller.get)
  // A fresh one (a new quiz)
  app.post('/:documentId/study/:kind', { schema: { params: studyParamsSchema }, config: studyLimit }, controller.refresh)
}

export default studyRoutes
