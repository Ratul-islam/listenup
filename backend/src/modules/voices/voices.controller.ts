import type { FastifyReply, FastifyRequest } from 'fastify'
import { SIGNED_URL_TTL_SECONDS } from '../../config/constants.js'
import { ON_DEVICE_MODEL } from '../../config/on-device-voice.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { sendSuccess } from '../../utils/responses.js'
import type { TtsService } from '../tts/tts.service.js'
import { findVoice, PREVIEW_TEXT } from './voice-catalog.js'
import type { PreferencesBody, VoiceParams } from './voices.schema.js'
import type { VoicesService } from './voices.service.js'

// How long an "is the on-device package uploaded?" answer is reused
const PACKAGE_CHECK_MS = 5 * 60_000

export class VoicesController {
  private packageChecked: { at: number; uploaded: boolean } | null = null

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

  /**
   * The Kokoro package for voicing Natural voices on the phone: its version,
   * size, checksum and a download link. Not available until it's uploaded.
   */
  onDeviceModel = async (_request: FastifyRequest, reply: FastifyReply) => {
    const { key, speakers, ...model } = ON_DEVICE_MODEL
    if (!this.packageChecked || Date.now() - this.packageChecked.at > PACKAGE_CHECK_MS) {
      this.packageChecked = { at: Date.now(), uploaded: await storage.exists(key) }
    }
    if (!this.packageChecked.uploaded) return sendSuccess(reply, { data: { available: false as const } })
    return sendSuccess(reply, {
      data: { available: true as const, ...model, speakers: [...speakers], url: await storage.signedUrl(key, SIGNED_URL_TTL_SECONDS) },
    })
  }
}
