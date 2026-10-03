import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { UsersRepository } from './users.repository.js'
import { UsersService } from './users.service.js'
import { UsersController } from './users.controller.js'
import { updateProfileSchema } from './users.schema.js'

const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new UsersController(new UsersService(new UsersRepository(prisma)))

  // Every users route requires a valid access token
  app.addHook('preHandler', app.verifyAccess)

  app.get('/me', controller.getMe)
  app.patch('/me', { schema: { body: updateProfileSchema } }, controller.updateMe)
  app.delete('/me', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, controller.closeMe)
}

export default usersRoutes
