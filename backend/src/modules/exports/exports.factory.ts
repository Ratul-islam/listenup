import { prisma } from '../../config/db.js'
import { createTtsProvider } from '../tts/providers/provider-factory.js'
import { TtsRepository } from '../tts/tts.repository.js'
import { TtsService } from '../tts/tts.service.js'
import { UsageRepository } from '../usage/usage.repository.js'
import { UsageService } from '../usage/usage.service.js'
import { VoicesRepository } from '../voices/voices.repository.js'
import { VoicesService } from '../voices/voices.service.js'
import { ExportsRepository } from './exports.repository.js'
import { ExportsService } from './exports.service.js'

/** Shared by the routes and the worker */
export function createExportsService() {
  const usage = new UsageService(new UsageRepository(prisma))
  return new ExportsService(
    new ExportsRepository(prisma),
    new VoicesService(new VoicesRepository(prisma)),
    usage,
    new TtsService(new TtsRepository(prisma), usage, createTtsProvider()),
  )
}
