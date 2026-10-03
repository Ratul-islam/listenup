import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { ExpressionsService } from './expressions.service.js'
import type { ChunkExpressionsBody, ChunkParams, ClearQuery, DocumentParams } from './expressions.schema.js'

export class ExpressionsController {
  constructor(private readonly expressionsService: ExpressionsService) {}

  setChunk = async (request: FastifyRequest<{ Params: ChunkParams; Body: ChunkExpressionsBody }>, reply: FastifyReply) => {
    const { documentId, index } = request.params
    const expressions = await this.expressionsService.setChunk(request.user.sub, documentId, index, request.body)
    return sendSuccess(reply, { message: 'Saved', data: { expressions } })
  }

  startAuto = async (request: FastifyRequest<{ Params: DocumentParams }>, reply: FastifyReply) => {
    const document = await this.expressionsService.startAuto(request.user.sub, request.params.documentId)
    return sendSuccess(reply, { statusCode: 202, message: 'Adding emotions', data: { document } })
  }

  clear = async (request: FastifyRequest<{ Params: DocumentParams; Querystring: ClearQuery }>, reply: FastifyReply) => {
    const data = await this.expressionsService.clear(request.user.sub, request.params.documentId, request.query.only === 'ai')
    return sendSuccess(reply, { message: 'Emotions removed', data })
  }
}
