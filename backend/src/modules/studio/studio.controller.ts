import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { PostBody, StudioParams, StudioSettingsBody } from './studio.schema.js'
import type { StudioService } from './studio.service.js'

export class StudioController {
  constructor(private readonly studioService: StudioService) {}

  catalog = async (_request: FastifyRequest, reply: FastifyReply) => sendSuccess(reply, { data: this.studioService.catalog() })

  writePost = async (request: FastifyRequest<{ Params: StudioParams; Body: PostBody }>, reply: FastifyReply) => {
    const data = await this.studioService.writePost(request.user.sub, request.params.documentId, request.body)
    return sendSuccess(reply, { message: 'Written', data })
  }

  update = async (request: FastifyRequest<{ Params: StudioParams; Body: StudioSettingsBody }>, reply: FastifyReply) => {
    const data = await this.studioService.update(request.user.sub, request.params.documentId, request.body)
    return sendSuccess(reply, { message: 'Saved', data })
  }
}
