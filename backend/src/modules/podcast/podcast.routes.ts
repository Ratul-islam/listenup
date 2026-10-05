import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { createExportsService } from '../exports/exports.factory.js'
import { PodcastController } from './podcast.controller.js'
import { PodcastRepository } from './podcast.repository.js'
import { episodeFileParamsSchema, episodeParamsSchema, feedParamsSchema } from './podcast.schema.js'
import { PodcastService } from './podcast.service.js'

// Podcast apps refresh feeds every so often; a person's few apps stay far below this
const publicLimit = { rateLimit: { max: 60, timeWindow: '1 minute' } }

const podcastRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new PodcastController(new PodcastService(new PodcastRepository(prisma), createExportsService()))
  const auth = { preHandler: app.verifyAccess }

  app.get('/', auth, controller.overview)
  app.post('/link/reset', { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, controller.resetLink)
  app.get('/episodes/:documentId', { ...auth, schema: { params: episodeParamsSchema } }, controller.episode)
  app.put('/episodes/:documentId', { ...auth, schema: { params: episodeParamsSchema }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, controller.add)
  app.delete('/episodes/:documentId', { ...auth, schema: { params: episodeParamsSchema } }, controller.remove)

  // Podcast apps: the secret in the address is the only authentication
  app.get('/:token/feed.xml', { schema: { params: feedParamsSchema }, config: publicLimit }, controller.feed)
  // HEAD before GET, or Fastify adds its own HEAD that redirects to a GET-only storage link
  app.head('/:token/episodes/:file', { schema: { params: episodeFileParamsSchema }, config: publicLimit }, controller.episodeHead)
  app.get('/:token/episodes/:file', { schema: { params: episodeFileParamsSchema }, config: publicLimit }, controller.episodeFile)
  app.get('/cover.jpg', { config: publicLimit }, controller.cover)
}

export default podcastRoutes
