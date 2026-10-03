import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { PlansController } from './plans.controller.js'
import { PlansRepository } from './plans.repository.js'
import { PlansService } from './plans.service.js'

const plansRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new PlansController(new PlansService(new PlansRepository(prisma)))
  app.addHook('preHandler', app.verifyAccess)
  app.get('/', controller.list)
}

export default plansRoutes
