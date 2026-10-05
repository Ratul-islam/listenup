import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { RedeemBody } from './invites.schema.js'
import type { InvitesService } from './invites.service.js'

export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  overview = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.invitesService.overview(request.user.sub) })
  }

  redeem = async (request: FastifyRequest<{ Body: RedeemBody }>, reply: FastifyReply) => {
    const data = await this.invitesService.redeem(request.user.sub, request.body.code)
    return sendSuccess(reply, { message: 'Invite code added', data })
  }
}
