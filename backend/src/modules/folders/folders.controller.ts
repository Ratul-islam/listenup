import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { FolderBody, FolderParams } from './folders.schema.js'
import type { FoldersService } from './folders.service.js'

export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: { folders: await this.foldersService.list(request.user.sub) } })
  }

  get = async (request: FastifyRequest<{ Params: FolderParams }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: { folder: await this.foldersService.get(request.user.sub, request.params.id) } })
  }

  create = async (request: FastifyRequest<{ Body: FolderBody }>, reply: FastifyReply) => {
    const folder = await this.foldersService.create(request.user.sub, request.body.name)
    return sendSuccess(reply, { statusCode: 201, message: 'Folder created', data: { folder } })
  }

  rename = async (request: FastifyRequest<{ Params: FolderParams; Body: FolderBody }>, reply: FastifyReply) => {
    const folder = await this.foldersService.rename(request.user.sub, request.params.id, request.body.name)
    return sendSuccess(reply, { message: 'Folder renamed', data: { folder } })
  }

  remove = async (request: FastifyRequest<{ Params: FolderParams }>, reply: FastifyReply) => {
    await this.foldersService.remove(request.user.sub, request.params.id)
    return sendSuccess(reply, { message: 'Folder deleted' })
  }
}
