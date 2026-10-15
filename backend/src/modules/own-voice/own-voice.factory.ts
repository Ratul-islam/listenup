import { prisma } from '../../config/db.js'
import { createTtsService } from '../tts/tts.factory.js'
import { OwnVoiceRepository } from './own-voice.repository.js'
import { OwnVoiceService } from './own-voice.service.js'

/** Shared by the routes, the worker and account erasure */
export function createOwnVoiceService() {
  return new OwnVoiceService(new OwnVoiceRepository(prisma), createTtsService())
}
