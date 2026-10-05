import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { InvitesController } from './invites.controller.js'
import { createInvitesService } from './invites.factory.js'
import { redeemBodySchema } from './invites.schema.js'

const invitesRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new InvitesController(createInvitesService())
  app.addHook('preHandler', app.verifyAccess)

  app.get('/', controller.overview)
  // Few tries a minute, so codes can't be guessed
  app.post('/redeem', { schema: { body: redeemBodySchema }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, controller.redeem)
}

export default invitesRoutes
