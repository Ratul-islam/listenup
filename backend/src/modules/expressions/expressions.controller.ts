import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { ExpressionsService } from './expressions.service.js'
import type { ChunkExpressionsBody, ChunkParams, ClearQuery, DescribeBody, DocumentParams, NarrationBody } from './expressions.schema.js'

export class ExpressionsController {
  constructor(private readonly expressionsService: ExpressionsService) {}

  setChunk = async (request: FastifyRequest<{ Params: ChunkParams; Body: ChunkExpressionsBody }>, reply: FastifyReply) => {
    const { documentId, index } = request.params
    const expressions = await this.expressionsService.setChunk(request.user.sub, documentId, index, request.body)
    return sendSuccess(reply, { message: 'Saved', data: { expressions } })
  }

  describe = async (request: FastifyRequest<{ Params: ChunkParams; Body: DescribeBody }>, reply: FastifyReply) => {
    const { documentId, index } = request.params
    const data = await this.expressionsService.describe(request.user.sub, documentId, index, request.body)
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

  clear = async (request: FastifyRequest<{ Params: DocumentParams; Querystring: ClearQuery }>, reply: FastifyReply) => {
    const data = await this.expressionsService.clear(request.user.sub, request.params.documentId, request.query.only === 'ai')
    return sendSuccess(reply, { message: 'Emotions removed', data })
  }
}
