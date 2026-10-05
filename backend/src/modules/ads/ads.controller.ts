import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { AdsService } from './ads.service.js'

export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  status = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.adsService.status(request.user.sub) })
  }

  claim = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { message: 'Minutes added', data: await this.adsService.claim(request.user.sub) })
  }

  verified = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.adsService.verifiedReward(request.raw.url ?? '') })
  }
}
