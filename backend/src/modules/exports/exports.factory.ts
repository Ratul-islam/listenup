import { prisma } from '../../config/db.js'
import { createTtsService } from '../tts/tts.factory.js'
import { createUsageService } from '../usage/usage.factory.js'
import { VoicesRepository } from '../voices/voices.repository.js'
import { VoicesService } from '../voices/voices.service.js'
import { ExportsRepository } from './exports.repository.js'
import { ExportsService } from './exports.service.js'

/** Shared by the routes and the worker */
export function createExportsService() {
  return new ExportsService(new ExportsRepository(prisma), new VoicesService(new VoicesRepository(prisma)), createUsageService(), createTtsService())
}
