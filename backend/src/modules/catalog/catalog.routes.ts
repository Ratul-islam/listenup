import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { CatalogController } from './catalog.controller.js'
import { CatalogRepository } from './catalog.repository.js'
import { CatalogService } from './catalog.service.js'

/** Explore's free classics. Adding one is `POST /documents` with `{ from: 'catalog', id }`. */
const catalogRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new CatalogController(new CatalogService(new CatalogRepository(prisma)))

  app.addHook('preHandler', app.verifyAccess)

  app.get('/', controller.list)
}

export default catalogRoutes
