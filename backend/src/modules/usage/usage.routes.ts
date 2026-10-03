import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { UsageController } from './usage.controller.js'
import { UsageRepository } from './usage.repository.js'
import { UsageService } from './usage.service.js'

const usageRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new UsageController(new UsageService(new UsageRepository(prisma)))
  app.addHook('preHandler', app.verifyAccess)
  app.get('/', controller.summary)
}

export default usageRoutes
