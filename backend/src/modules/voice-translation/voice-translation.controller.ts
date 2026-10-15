import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { ConsentBody, CreateBody, TranslationParams, UploadStartBody } from './voice-translation.schema.js'
import type { VoiceTranslationService } from './voice-translation.service.js'

export class VoiceTranslationController {
  constructor(private readonly service: VoiceTranslationService) {}

  startUpload = async (request: FastifyRequest<{ Body: UploadStartBody }>, reply: FastifyReply) =>
    sendSuccess(reply, { data: await this.service.startUpload(request.user.sub, request.body) })

  create = async (request: FastifyRequest<{ Body: CreateBody }>, reply: FastifyReply) =>
    sendSuccess(reply, { statusCode: 202, message: 'Translating your recording', data: { translation: await this.service.create(request.user.sub, request.body) } })

  get = async (request: FastifyRequest<{ Params: TranslationParams }>, reply: FastifyReply) =>
    sendSuccess(reply, { data: { translation: await this.service.state(request.user.sub, request.params.documentId) } })

  consent = async (request: FastifyRequest<{ Params: TranslationParams; Body: ConsentBody }>, reply: FastifyReply) =>
    sendSuccess(reply, { message: 'The speaker’s voice is ready', data: { translation: await this.service.consent(request.user.sub, request.params.documentId, request.body) } })
}
