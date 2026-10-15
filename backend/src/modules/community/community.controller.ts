import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type {
  ContestParams,
  FeedQuery,
  IdParams,
  PreviewQuery,
  ProfileBody,
  PublishBody,
  ReportBody,
  ReviewBody,
  ThemeBody,
  UnblockParams,
} from './community.schema.js'
import type { CommunityService } from './community.service.js'
import type { ContestService } from './contest.service.js'

export class CommunityController {
  constructor(
    private readonly communityService: CommunityService,
    private readonly contestService: ContestService,
  ) {}

  feed = async (request: FastifyRequest<{ Querystring: FeedQuery }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.communityService.feed(request.user.sub, request.query) })
  }

  get = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: { item: await this.communityService.get(request.user.sub, request.params.id) } })
  }

  mine = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: { items: await this.communityService.mine(request.user.sub) } })
  }

  profile = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.communityService.profile(request.user.sub) })
  }

  setProfile = async (request: FastifyRequest<{ Body: ProfileBody }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.communityService.setPenName(request.user.sub, request.body.penName) })
  }

  preview = async (request: FastifyRequest<{ Querystring: PreviewQuery }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.communityService.preview(request.user.sub, request.query) })
  }

  publish = async (request: FastifyRequest<{ Body: PublishBody }>, reply: FastifyReply) => {
    const item = await this.communityService.publish(request.user.sub, request.body)
    return sendSuccess(reply, { statusCode: 201, message: 'Checking it before it goes into Explore', data: { item } })
  }

  unpublish = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    await this.communityService.unpublish(request.user.sub, request.params.id)
    return sendSuccess(reply, { message: 'Unpublished' })
  }

  retry = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: { item: await this.communityService.retry(request.user.sub, request.params.id) } })
  }

  heart = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.communityService.heart(request.user.sub, request.params.id) })
  }

  unheart = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.communityService.unheart(request.user.sub, request.params.id) })
  }

  report = async (request: FastifyRequest<{ Params: IdParams; Body: ReportBody }>, reply: FastifyReply) => {
    await this.communityService.report(request.user.sub, request.params.id, request.body)
    return sendSuccess(reply, { message: 'Thanks for telling us' })
  }

  blockWriter = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    await this.communityService.blockWriter(request.user.sub, request.params.id)
    return sendSuccess(reply, { message: 'Blocked' })
  }

  blocks = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: { items: await this.communityService.blocks(request.user.sub) } })
  }

  unblock = async (request: FastifyRequest<{ Params: UnblockParams }>, reply: FastifyReply) => {
    await this.communityService.unblock(request.user.sub, request.params.userId)
    return sendSuccess(reply, { message: 'Unblocked' })
  }

  clipAudio = async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.communityService.clipAudio(request.user.sub, request.params.id) })
  }

  contest = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.contestService.view(request.user.sub) })
  }

  winsSeen = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.contestService.markWinsSeen(request.user.sub)
    return sendSuccess(reply)
  }

  reviewQueue = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: { items: await this.communityService.reviewQueue(request.user.sub) } })
  }

  review = async (request: FastifyRequest<{ Params: IdParams; Body: ReviewBody }>, reply: FastifyReply) => {
    await this.communityService.review(request.user.sub, request.params.id, request.body)
    return sendSuccess(reply, { message: request.body.action === 'remove' ? 'Taken down' : 'Restored' })
  }

  setTheme = async (request: FastifyRequest<{ Params: ContestParams; Body: ThemeBody }>, reply: FastifyReply) => {
    await this.communityService.assertAdmin(request.user.sub)
    return sendSuccess(reply, { data: await this.contestService.setTheme(request.params.month, request.body.theme) })
  }
}
