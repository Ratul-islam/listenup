import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { DocumentsService } from './documents.service.js'
import type { CreateBody, IdParams, ListQuery, ReprocessBody, ScriptQuery, TranslateBody, UpdateBody, UploadStartBody } from './documents.schema.js'

export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  list = async (request: FastifyRequest<{ Querystring: ListQuery }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.documentsService.list(request.user.sub, request.query) })
  }

  get = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    const document = await this.documentsService.get(request.user.sub, request.params.id)
    return sendSuccess(reply, { data: { document } })
  }

  startUpload = async (request: FastifyRequest<{ Body: UploadStartBody }>, reply: FastifyReply) => {
    const data = await this.documentsService.startUpload(request.user.sub, request.body)
    return sendSuccess(reply, { statusCode: 201, data })
  }

  create = async (request: FastifyRequest<{ Body: CreateBody }>, reply: FastifyReply) => {
    const document = await this.documentsService.create(request.user.sub, request.body)
    return sendSuccess(reply, { statusCode: 201, message: 'Import started', data: { document } })
  }

  update = async (request: FastifyRequest<{ Params: IdParams; Body: UpdateBody }>, reply: FastifyReply) => {
    const document = await this.documentsService.update(request.user.sub, request.params.id, request.body)
    return sendSuccess(reply, { message: 'Saved', data: { document } })
  }

  translate = async (request: FastifyRequest<{ Params: IdParams; Body: TranslateBody }>, reply: FastifyReply) => {
    const document = await this.documentsService.translate(request.user.sub, request.params.id, request.body)
    return sendSuccess(reply, { statusCode: 201, message: 'Translating', data: { document } })
  }

  reprocess = async (request: FastifyRequest<{ Params: IdParams; Body: ReprocessBody }>, reply: FastifyReply) => {
    const document = await this.documentsService.reprocess(request.user.sub, request.params.id, request.body.ocr, request.body.keepClutter)
    return sendSuccess(reply, { message: 'Reading the document again', data: { document } })
  }

  remove = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    await this.documentsService.remove(request.user.sub, request.params.id)
    return sendSuccess(reply, { message: 'Deleted' })
  }

  script = async (request: FastifyRequest<{ Params: IdParams; Querystring: ScriptQuery }>, reply: FastifyReply) => {
    const data = await this.documentsService.script(request.user.sub, request.params.id, request.query.voiceId)
    return sendSuccess(reply, { data })
  }
}
