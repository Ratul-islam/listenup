import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { PreviewBody, PronunciationBody, PronunciationParams, PronunciationUpdate } from './pronunciations.schema.js'
import type { PronunciationsService } from './pronunciations.service.js'

export class PronunciationsController {
  constructor(private readonly pronunciationsService: PronunciationsService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const pronunciations = await this.pronunciationsService.list(request.user.sub)
    return sendSuccess(reply, { data: { pronunciations } })
  }

  save = async (request: FastifyRequest<{ Body: PronunciationBody }>, reply: FastifyReply) => {
    const pronunciation = await this.pronunciationsService.save(request.user.sub, request.body)
    return sendSuccess(reply, { statusCode: 201, message: 'Saved', data: { pronunciation } })
  }

  update = async (request: FastifyRequest<{ Params: PronunciationParams; Body: PronunciationUpdate }>, reply: FastifyReply) => {
    const pronunciation = await this.pronunciationsService.update(request.user.sub, request.params.id, request.body)
    return sendSuccess(reply, { message: 'Saved', data: { pronunciation } })
  }

  remove = async (request: FastifyRequest<{ Params: PronunciationParams }>, reply: FastifyReply) => {
    await this.pronunciationsService.remove(request.user.sub, request.params.id)
    return sendSuccess(reply, { message: 'Removed' })
  }

  preview = async (request: FastifyRequest<{ Body: PreviewBody }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.pronunciationsService.preview(request.user.sub, request.body) })
  }
}
