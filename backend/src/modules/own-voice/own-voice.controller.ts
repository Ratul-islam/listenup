import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { RecordBody } from './own-voice.schema.js'
import type { OwnVoiceService } from './own-voice.service.js'

export class OwnVoiceController {
  constructor(private readonly ownVoiceService: OwnVoiceService) {}

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.ownVoiceService.state(request.user.sub) })
  }

  record = async (request: FastifyRequest<{ Body: RecordBody }>, reply: FastifyReply) => {
    const state = await this.ownVoiceService.record(request.user.sub, request.body)
    return sendSuccess(reply, { message: 'Your voice is ready', data: state })
  }

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.ownVoiceService.remove(request.user.sub)
    return sendSuccess(reply, { message: 'Your voice is deleted', data: await this.ownVoiceService.state(request.user.sub) })
  }
}
