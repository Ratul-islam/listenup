import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { PlansService } from './plans.service.js'

export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.plansService.list(request.user.sub) })
  }
}
