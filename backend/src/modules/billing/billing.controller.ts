import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { WebhookBody } from './billing.schema.js'
import type { BillingService } from './billing.service.js'

export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  webhook = async (request: FastifyRequest<{ Body: WebhookBody }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.billingService.handleWebhook(request.headers.authorization, request.body) })
  }

  /** Called by the app right after a purchase or restore, so the plan applies without waiting for the webhook */
  sync = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.billingService.sync(request.user.sub) })
  }
}
