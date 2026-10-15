import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { StudioController } from './studio.controller.js'
import { StudioRepository } from './studio.repository.js'
import { StudioService } from './studio.service.js'

// What Studio offers: /studio/catalog
export const autoPrefix = '/studio'

const studioCatalogRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new StudioController(new StudioService(new StudioRepository(prisma)))

  app.addHook('preHandler', app.verifyAccess)

  // Platforms, narration types, tones, the speed and pitch ranges, and the starter templates
  app.get('/catalog', controller.catalog)
}

export default studioCatalogRoutes
