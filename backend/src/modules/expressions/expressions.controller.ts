import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { ExpressionsService } from './expressions.service.js'
import type { CastBody, ChunkParams, ClearQuery, DeliveryBody, DescribeBody, DocumentParams, NarrationBody } from './expressions.schema.js'

export class ExpressionsController {
  constructor(private readonly expressionsService: ExpressionsService) {}

  describe = async (request: FastifyRequest<{ Params: ChunkParams; Body: DescribeBody }>, reply: FastifyReply) => {
    const { documentId, index } = request.params
    const data = await this.expressionsService.describe(request.user.sub, documentId, index, request.body)
    return sendSuccess(reply, { message: 'Saved', data })
  }

  follow = async (request: FastifyRequest<{ Params: ChunkParams; Body: DeliveryBody }>, reply: FastifyReply) => {
    const { documentId, index } = request.params
    const data = await this.expressionsService.follow(request.user.sub, documentId, index, request.body)
    return sendSuccess(reply, { message: 'Saved', data })
  }

  setNarration = async (request: FastifyRequest<{ Params: DocumentParams; Body: NarrationBody }>, reply: FastifyReply) => {
    const document = await this.expressionsService.setNarration(request.user.sub, request.params.documentId, request.body)
    return sendSuccess(reply, { message: 'Narration updated', data: { document } })
  }

  startAuto = async (request: FastifyRequest<{ Params: DocumentParams; Body: NarrationBody }>, reply: FastifyReply) => {
    const document = await this.expressionsService.startAuto(request.user.sub, request.params.documentId, request.body)
    return sendSuccess(reply, { statusCode: 202, message: 'Adding emotions', data: { document } })
  }

  setCastVoice = async (request: FastifyRequest<{ Params: DocumentParams; Body: CastBody }>, reply: FastifyReply) => {
    const data = await this.expressionsService.setCastVoice(request.user.sub, request.params.documentId, request.body)
    return sendSuccess(reply, { message: 'Voice changed', data })
  }

  removeCast = async (request: FastifyRequest<{ Params: DocumentParams }>, reply: FastifyReply) => {
    const data = await this.expressionsService.removeCast(request.user.sub, request.params.documentId)
    return sendSuccess(reply, { message: 'Character voices removed', data })
  }

  clear = async (request: FastifyRequest<{ Params: DocumentParams; Querystring: ClearQuery }>, reply: FastifyReply) => {
    const data = await this.expressionsService.clear(request.user.sub, request.params.documentId, request.query.only === 'ai')
    return sendSuccess(reply, { message: 'Emotions removed', data })
  }
}
