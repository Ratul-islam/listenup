import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { DocumentsService } from './documents.service.js'
import type {
  IdParams,
  ListQuery,
  ReaderQuery,
  ReprocessBody,
  TextBody,
  UpdateBody,
  UploadCompleteBody,
  UploadParams,
  UploadStartBody,
  UrlBody,
  TranslateBody,
  DigestBody,
} from './documents.schema.js'

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

  completeUpload = async (request: FastifyRequest<{ Params: UploadParams; Body: UploadCompleteBody }>, reply: FastifyReply) => {
    const document = await this.documentsService.completeUpload(request.user.sub, request.params.uploadId, request.body)
    return sendSuccess(reply, { statusCode: 201, message: 'Import started', data: { document } })
  }

  createFromText = async (request: FastifyRequest<{ Body: TextBody }>, reply: FastifyReply) => {
    const document = await this.documentsService.createFromText(request.user.sub, request.body)
    return sendSuccess(reply, { statusCode: 201, message: 'Import started', data: { document } })
  }

  createFromUrl = async (request: FastifyRequest<{ Body: UrlBody }>, reply: FastifyReply) => {
    const document = await this.documentsService.createFromUrl(request.user.sub, request.body)
    return sendSuccess(reply, { statusCode: 201, message: 'Import started', data: { document } })
  }

  update = async (request: FastifyRequest<{ Params: IdParams; Body: UpdateBody }>, reply: FastifyReply) => {
    const document = await this.documentsService.update(request.user.sub, request.params.id, request.body)
    return sendSuccess(reply, { message: 'Saved', data: { document } })
  }

  digest = async (request: FastifyRequest<{ Body: DigestBody }>, reply: FastifyReply) => {
    const document = await this.documentsService.digest(request.user.sub, request.body)
    return sendSuccess(reply, { data: { document } })
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

  reader = async (request: FastifyRequest<{ Params: IdParams; Querystring: ReaderQuery }>, reply: FastifyReply) => {
    const data = await this.documentsService.reader(request.user.sub, request.params.id, request.query.voiceId)
    return sendSuccess(reply, { data })
  }
}
