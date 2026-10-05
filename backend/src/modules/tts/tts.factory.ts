import { prisma } from '../../config/db.js'
import { createUsageService } from '../usage/usage.factory.js'
import { createTtsProvider } from './providers/provider-factory.js'
import { TtsRepository } from './tts.repository.js'
import { TtsService } from './tts.service.js'

/** Shared by routes, exports and workers */
export function createTtsService() {
  return new TtsService(new TtsRepository(prisma), createUsageService(), createTtsProvider())
}
