import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from '../../utils/AppError.js'
import { sendSuccess } from '../../utils/responses.js'
import type { DocumentsService } from './documents.service.js'
import type { IdParams, ListQuery, ReaderQuery, ReprocessBody, TextBody, UpdateBody, UrlBody } from './documents.schema.js'

export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  list = async (request: FastifyRequest<{ Querystring: ListQuery }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.documentsService.list(request.user.sub, request.query) })
  }

  get = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    const document = await this.documentsService.get(request.user.sub, request.params.id)
    return sendSuccess(reply, { data: { document } })
  }

  upload = async (request: FastifyRequest, reply: FastifyReply) => {
    const file = await request.file()
    if (!file) throw new AppError('Choose a file to import', 400, 'NO_FILE')

    let buffer: Buffer
    try {
      buffer = await file.toBuffer()
    } catch (e) {
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new AppError('That file is too large to import', 413, 'FILE_TOO_LARGE')
      }
      throw e
    }

    const document = await this.documentsService.upload(request.user.sub, {
      filename: file.filename,
      mimetype: file.mimetype,
      buffer,
    })
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

  reprocess = async (request: FastifyRequest<{ Params: IdParams; Body: ReprocessBody }>, reply: FastifyReply) => {
    const document = await this.documentsService.reprocess(request.user.sub, request.params.id, request.body.ocr)
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
