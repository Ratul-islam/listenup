import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { EpisodeFileParams, EpisodeParams, FeedParams } from './podcast.schema.js'
import type { PodcastService } from './podcast.service.js'

export class PodcastController {
  constructor(private readonly podcastService: PodcastService) {}

  overview = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: { podcast: await this.podcastService.overview(request.user.sub) } })
  }

  resetLink = async (request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { message: 'New podcast link made', data: { podcast: await this.podcastService.resetLink(request.user.sub) } })
  }

  episode = async (request: FastifyRequest<{ Params: EpisodeParams }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: { episode: await this.podcastService.episode(request.user.sub, request.params.documentId) } })
  }

  add = async (request: FastifyRequest<{ Params: EpisodeParams }>, reply: FastifyReply) => {
    const episode = await this.podcastService.add(request.user.sub, request.params.documentId)
    return sendSuccess(reply, { statusCode: 202, message: 'Added to your podcast', data: { episode } })
  }

  remove = async (request: FastifyRequest<{ Params: EpisodeParams }>, reply: FastifyReply) => {
    await this.podcastService.remove(request.user.sub, request.params.documentId)
    return sendSuccess(reply, { message: 'Removed from your podcast' })
  }

  feed = async (request: FastifyRequest<{ Params: FeedParams }>, reply: FastifyReply) => {
    const xml = await this.podcastService.feed(request.params.token)
    return reply.header('Content-Type', 'application/rss+xml; charset=utf-8').header('Cache-Control', 'private, max-age=300').send(xml)
  }

  episodeFile = async (request: FastifyRequest<{ Params: EpisodeFileParams }>, reply: FastifyReply) => {
    const url = await this.podcastService.episodeFile(request.params.token, request.params.file)
    return reply.redirect(url, 302)
  }

  episodeHead = async (request: FastifyRequest<{ Params: EpisodeFileParams }>, reply: FastifyReply) => {
    const size = await this.podcastService.episodeSize(request.params.token, request.params.file)
    reply.header('Content-Type', 'audio/mpeg').header('Accept-Ranges', 'bytes')
    if (size) reply.header('Content-Length', size)
    return reply.send()
  }

  cover = async (_request: FastifyRequest, reply: FastifyReply) => {
    const image = await this.podcastService.coverImage()
    return reply.header('Content-Type', 'image/jpeg').header('Cache-Control', 'public, max-age=604800').send(image)
  }
}
