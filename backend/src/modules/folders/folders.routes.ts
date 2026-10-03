import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { FoldersController } from './folders.controller.js'
import { FoldersRepository } from './folders.repository.js'
import { folderBodySchema, folderParamsSchema } from './folders.schema.js'
import { FoldersService } from './folders.service.js'

const foldersRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new FoldersController(new FoldersService(new FoldersRepository(prisma)))

  app.addHook('preHandler', app.verifyAccess)

  app.get('/', controller.list)
  app.post('/', { schema: { body: folderBodySchema } }, controller.create)
  app.get('/:id', { schema: { params: folderParamsSchema } }, controller.get)
  app.patch('/:id', { schema: { params: folderParamsSchema, body: folderBodySchema } }, controller.rename)
  app.delete('/:id', { schema: { params: folderParamsSchema } }, controller.remove)
}

export default foldersRoutes
