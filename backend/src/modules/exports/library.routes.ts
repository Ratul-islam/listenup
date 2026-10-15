import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { ExportsController } from './exports.controller.js'
import { createExportsService } from './exports.factory.js'

// "Your exports": every MP3 the listener has made, across their documents
export const autoPrefix = '/exports'

const exportsLibraryRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new ExportsController(createExportsService())

  app.addHook('preHandler', app.verifyAccess)

  app.get('/', controller.list)
}

export default exportsLibraryRoutes
