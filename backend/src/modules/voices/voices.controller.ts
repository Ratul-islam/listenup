import type { FastifyReply, FastifyRequest } from 'fastify'
import { SIGNED_URL_TTL_SECONDS } from '../../config/constants.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { sendSuccess } from '../../utils/responses.js'
import type { TtsService } from '../tts/tts.service.js'
import { findVoice, PREVIEW_TEXT } from './voice-catalog.js'
import type { PreferencesBody, VoiceParams } from './voices.schema.js'
import type { VoicesService } from './voices.service.js'

export class VoicesController {
  constructor(
    private readonly voicesService: VoicesService,
    private readonly ttsService: TtsService,
  ) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const [voices, preferences] = await Promise.all([
      this.voicesService.list(),
      this.voicesService.getPreferences(request.user.sub),
    ])
    return sendSuccess(reply, { data: { voices, preferences } })
  }

  updatePreferences = async (request: FastifyRequest<{ Body: PreferencesBody }>, reply: FastifyReply) => {
    const preferences = await this.voicesService.updatePreferences(request.user.sub, request.body)
    return sendSuccess(reply, { message: 'Saved', data: { preferences } })
  }

  preview = async (request: FastifyRequest<{ Params: VoiceParams }>, reply: FastifyReply) => {
    const voice = findVoice(request.params.id)
    if (!voice) throw new AppError('Voice not found', 404, 'VOICE_NOT_FOUND')
    const key = await this.ttsService.preview(voice, PREVIEW_TEXT[voice.language])
    return sendSuccess(reply, { data: { url: await storage.signedUrl(key, SIGNED_URL_TTL_SECONDS) } })
  }
}
