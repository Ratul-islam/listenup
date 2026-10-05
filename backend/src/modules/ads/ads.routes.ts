import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { AdsController } from './ads.controller.js'
import { AdsRepository } from './ads.repository.js'
import { AdsService } from './ads.service.js'

const adsRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new AdsController(new AdsService(new AdsRepository(prisma)))

  app.get('/', { preHandler: app.verifyAccess }, controller.status)
  app.post('/rewards', { preHandler: app.verifyAccess, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, controller.claim)
  // AdMob calls this after a rewarded ad; it's authenticated by Google's signature, not a user token
  app.get('/rewards/verify', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, controller.verified)
}

export default adsRoutes
