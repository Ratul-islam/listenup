import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { UsageController } from './usage.controller.js'
import { createUsageService } from './usage.factory.js'

const usageRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new UsageController(createUsageService())
  app.addHook('preHandler', app.verifyAccess)
  app.get('/', controller.summary)
}

export default usageRoutes
