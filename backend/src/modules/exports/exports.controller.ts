import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { ExportBody, ExportParams } from './exports.schema.js'
import type { ExportsService } from './exports.service.js'

export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const items = await this.exportsService.list(request.user.sub)
    return sendSuccess(reply, { data: { items } })
  }

  status = async (request: FastifyRequest<{ Params: ExportParams; Querystring: ExportBody }>, reply: FastifyReply) => {
    const data = await this.exportsService.status(request.user.sub, request.params.documentId, request.query.voiceId)
    return sendSuccess(reply, { data: { export: data } })
  }

  offlineStatus = async (request: FastifyRequest<{ Params: ExportParams; Querystring: ExportBody }>, reply: FastifyReply) => {
    const data = await this.exportsService.offlineStatus(request.user.sub, request.params.documentId, request.query.voiceId)
    return sendSuccess(reply, { data: { offline: data } })
  }

  startOffline = async (request: FastifyRequest<{ Params: ExportParams; Body: ExportBody }>, reply: FastifyReply) => {
    const data = await this.exportsService.startOffline(request.user.sub, request.params.documentId, request.body.voiceId)
    return sendSuccess(reply, { statusCode: 202, message: 'Preparing the download', data: { offline: data } })
  }

  offlineManifest = async (request: FastifyRequest<{ Params: ExportParams; Querystring: ExportBody }>, reply: FastifyReply) => {
    const data = await this.exportsService.offlineManifest(request.user.sub, request.params.documentId, request.query.voiceId)
    return sendSuccess(reply, { data })
  }

  start = async (request: FastifyRequest<{ Params: ExportParams; Body: ExportBody }>, reply: FastifyReply) => {
    const data = await this.exportsService.start(request.user.sub, request.params.documentId, request.body.voiceId)
    return sendSuccess(reply, { statusCode: 202, message: 'Preparing your MP3', data: { export: data } })
  }
}
