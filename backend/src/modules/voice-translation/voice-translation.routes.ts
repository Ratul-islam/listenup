import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { VoiceTranslationController } from './voice-translation.controller.js'
import { VoiceTranslationRepository } from './voice-translation.repository.js'
import { consentSchema, createSchema, translationParamsSchema, uploadStartSchema } from './voice-translation.schema.js'
import { VoiceTranslationService } from './voice-translation.service.js'

// Voice translation (Pro): /voice-translations
export const autoPrefix = '/voice-translations'

// A consent recording is a few seconds of .m4a, sent as base64
const CONSENT_BODY_LIMIT = 6 * 1024 * 1024

const voiceTranslationRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new VoiceTranslationController(new VoiceTranslationService(new VoiceTranslationRepository(prisma)))

  app.addHook('preHandler', app.verifyAccess)

  // Step 1: a link to upload the recording to; step 2: start translating it
  app.post('/uploads', { schema: { body: uploadStartSchema }, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, controller.startUpload)
  app.post('/', { schema: { body: createSchema }, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, controller.create)
  app.get('/:documentId', { schema: { params: translationParamsSchema } }, controller.get)
  // The speaker's consent recording: their voice is made from it and reads the translation
  app.post(
    '/:documentId/consent',
    { schema: { params: translationParamsSchema, body: consentSchema }, bodyLimit: CONSENT_BODY_LIMIT, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    controller.consent,
  )
}

export default voiceTranslationRoutes
