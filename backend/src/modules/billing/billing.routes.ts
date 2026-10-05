import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { BillingController } from './billing.controller.js'
import { createBillingService } from './billing.factory.js'
import { webhookBodySchema } from './billing.schema.js'

const billingRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new BillingController(createBillingService())

  // RevenueCat's server calls this; it authenticates with the webhook secret, not a user token
  app.post('/webhook', { schema: { body: webhookBodySchema } }, controller.webhook)
  app.post('/sync', { preHandler: app.verifyAccess, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, controller.sync)
}

export default billingRoutes
