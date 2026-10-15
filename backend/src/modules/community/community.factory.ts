import { prisma } from '../../config/db.js'
import { createInvitesService } from '../invites/invites.factory.js'
import { PlaybackRepository } from '../playback/playback.repository.js'
import { PlaybackService } from '../playback/playback.service.js'
import { createTtsService } from '../tts/tts.factory.js'
import { createUsageService } from '../usage/usage.factory.js'
import { VoicesRepository } from '../voices/voices.repository.js'
import { VoicesService } from '../voices/voices.service.js'
import { CommunityRepository } from './community.repository.js'
import { CommunityService } from './community.service.js'
import { ContestService } from './contest.service.js'

/** Shared by the routes and the worker */
export function createCommunityServices() {
  const repository = new CommunityRepository(prisma)
  const voices = new VoicesService(new VoicesRepository(prisma))
  const tts = createTtsService()
  const invites = createInvitesService()
  const playback = new PlaybackService(new PlaybackRepository(prisma), voices, tts, (userId) => invites.checkReward(userId))
  return {
    community: new CommunityService(repository, voices, createUsageService(), tts, playback),
    contest: new ContestService(repository),
  }
}
