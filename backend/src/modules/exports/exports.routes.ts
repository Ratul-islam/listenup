import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { ExportsController } from './exports.controller.js'
import { createExportsService } from './exports.factory.js'
import { exportBodySchema, exportParamsSchema } from './exports.schema.js'

const exportsRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new ExportsController(createExportsService())

  app.addHook('preHandler', app.verifyAccess)

  app.get('/:documentId', { schema: { params: exportParamsSchema, querystring: exportBodySchema } }, controller.status)
  app.post(
    '/:documentId',
    { schema: { params: exportParamsSchema, body: exportBodySchema }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.start,
  )
}

export default exportsRoutes
