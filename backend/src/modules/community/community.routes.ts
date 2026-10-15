import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { CommunityController } from './community.controller.js'
import { createCommunityServices } from './community.factory.js'
import {
  contestParamsSchema,
  feedQuerySchema,
  idParamsSchema,
  previewQuerySchema,
  profileBodySchema,
  publishBodySchema,
  reportBodySchema,
  reviewBodySchema,
  themeBodySchema,
  unblockParamsSchema,
} from './community.schema.js'

const publishLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } }
// A writing can come with its cover picture, as base64 in the JSON body
const PUBLISH_BODY_LIMIT = 9 * 1024 * 1024
const tapLimit = { rateLimit: { max: 60, timeWindow: '1 minute' } }

/**
 * Explore's Community: writings and voice clips people publish, the monthly
 * contest, and keeping it safe (reports, blocks, the team's review). Adding a
 * writing to the shelf is `POST /documents` with `{ from: 'community', id }`.
 */
const communityRoutes: FastifyPluginAsyncZod = async (app) => {
  const { community, contest } = createCommunityServices()
  const controller = new CommunityController(community, contest)

  app.addHook('preHandler', app.verifyAccess)

  app.get('/', { schema: { querystring: feedQuerySchema } }, controller.feed)
  app.post('/', { schema: { body: publishBodySchema }, bodyLimit: PUBLISH_BODY_LIMIT, config: publishLimit }, controller.publish)
  // Before publishing a writing: whether it can be, what's left to voice, the contest
  app.get('/preview', { schema: { querystring: previewQuerySchema } }, controller.preview)
  app.get('/mine', controller.mine)
  app.get('/profile', controller.profile)
  app.put('/profile', { schema: { body: profileBodySchema }, config: publishLimit }, controller.setProfile)
  app.get('/blocks', controller.blocks)
  app.delete('/blocks/:userId', { schema: { params: unblockParamsSchema } }, controller.unblock)

  app.get('/contest', controller.contest)
  app.post('/contest/wins/seen', controller.winsSeen)

  // The ListenUp team (ADMIN_EMAILS)
  app.get('/review', controller.reviewQueue)
  app.post('/review/:id', { schema: { params: idParamsSchema, body: reviewBodySchema } }, controller.review)
  app.put('/contests/:month/theme', { schema: { params: contestParamsSchema, body: themeBodySchema } }, controller.setTheme)

  app.get('/:id', { schema: { params: idParamsSchema } }, controller.get)
  app.delete('/:id', { schema: { params: idParamsSchema } }, controller.unpublish)
  app.post('/:id/retry', { schema: { params: idParamsSchema }, config: publishLimit }, controller.retry)
  app.get('/:id/audio', { schema: { params: idParamsSchema }, config: tapLimit }, controller.clipAudio)
  app.put('/:id/heart', { schema: { params: idParamsSchema }, config: tapLimit }, controller.heart)
  app.delete('/:id/heart', { schema: { params: idParamsSchema }, config: tapLimit }, controller.unheart)
  app.post('/:id/report', { schema: { params: idParamsSchema, body: reportBodySchema }, config: publishLimit }, controller.report)
  app.post('/:id/block', { schema: { params: idParamsSchema }, config: publishLimit }, controller.blockWriter)
}

export default communityRoutes
