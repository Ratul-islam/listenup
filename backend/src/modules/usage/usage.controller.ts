import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { UsageService } from './usage.service.js'

export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  summary = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.usageService.summary(request.user.sub) })
  }
}
