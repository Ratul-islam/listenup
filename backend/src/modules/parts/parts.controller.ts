import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { DocumentParams, EditPartBody, InsertPartBody, PartParams, ReplaceBody, SentenceParams } from './parts.schema.js'
import type { PartsService } from './parts.service.js'

export class PartsController {
  constructor(private readonly partsService: PartsService) {}

  edit = async (request: FastifyRequest<{ Params: PartParams; Body: EditPartBody }>, reply: FastifyReply) => {
    const { documentId, index } = request.params
    const data = await this.partsService.edit(request.user.sub, documentId, index, request.body)
    return sendSuccess(reply, { message: 'Saved', data })
  }

  insert = async (request: FastifyRequest<{ Params: DocumentParams; Body: InsertPartBody }>, reply: FastifyReply) => {
    const data = await this.partsService.insert(request.user.sub, request.params.documentId, request.body)
    return sendSuccess(reply, { statusCode: 201, message: 'Added', data })
  }

  remove = async (request: FastifyRequest<{ Params: PartParams }>, reply: FastifyReply) => {
    const { documentId, index } = request.params
    const data = await this.partsService.remove(request.user.sub, documentId, index)
    return sendSuccess(reply, { message: 'Part deleted', data })
  }

  retakeSentence = async (request: FastifyRequest<{ Params: SentenceParams }>, reply: FastifyReply) => {
    const { documentId, index, sentence } = request.params
    const data = await this.partsService.retakeSentence(request.user.sub, documentId, index, sentence)
    return sendSuccess(reply, { message: 'Sentence ready to record again', data })
  }

  replace = async (request: FastifyRequest<{ Params: DocumentParams; Body: ReplaceBody }>, reply: FastifyReply) => {
    const data = await this.partsService.replace(request.user.sub, request.params.documentId, request.body)
    return sendSuccess(reply, { message: request.body.apply ? 'Replaced' : 'Preview', data })
  }

  retake = async (request: FastifyRequest<{ Params: PartParams }>, reply: FastifyReply) => {
    const { documentId, index } = request.params
    const data = await this.partsService.retake(request.user.sub, documentId, index)
    return sendSuccess(reply, { message: 'New take ready to record', data })
  }
}
