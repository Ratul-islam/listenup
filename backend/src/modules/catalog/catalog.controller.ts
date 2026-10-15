import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { CatalogService } from './catalog.service.js'

export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: { items: await this.catalogService.list(request.user.sub) } })
  }
}
