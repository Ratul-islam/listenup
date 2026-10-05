import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendSuccess } from '../../utils/responses.js'
import type { PlaybackService } from './playback.service.js'
import type {
  AudioQuery,
  BookmarkBody,
  BookmarkParams,
  ChunkParams,
  DocumentParams,
  ProgressBody,
  StatsQuery, VoiceNoteBody } from './playback.schema.js'

export class PlaybackController {
  constructor(private readonly playbackService: PlaybackService) {}

  audio = async (request: FastifyRequest<{ Params: ChunkParams; Querystring: AudioQuery }>, reply: FastifyReply) => {
    const { documentId, index } = request.params
    const data = await this.playbackService.audio(request.user.sub, documentId, index, request.query.voiceId)
    return sendSuccess(reply, { data })
  }

  voiceNote = async (request: FastifyRequest<{ Params: DocumentParams; Body: VoiceNoteBody }>, reply: FastifyReply) => {
    const data = await this.playbackService.voiceNote(request.user.sub, request.params.documentId, request.body)
    return sendSuccess(reply, { data })
  }

  saveProgress = async (request: FastifyRequest<{ Params: DocumentParams; Body: ProgressBody }>, reply: FastifyReply) => {
    const state = await this.playbackService.saveProgress(request.user.sub, request.params.documentId, request.body)
    return sendSuccess(reply, { data: { state } })
  }

  stats = async (request: FastifyRequest<{ Querystring: StatsQuery }>, reply: FastifyReply) => {
    return sendSuccess(reply, { data: await this.playbackService.stats(request.user.sub, request.query.day) })
  }

  listBookmarks = async (request: FastifyRequest<{ Params: DocumentParams }>, reply: FastifyReply) => {
    const bookmarks = await this.playbackService.listBookmarks(request.user.sub, request.params.documentId)
    return sendSuccess(reply, { data: { bookmarks } })
  }

  addBookmark = async (request: FastifyRequest<{ Params: DocumentParams; Body: BookmarkBody }>, reply: FastifyReply) => {
    const bookmark = await this.playbackService.addBookmark(request.user.sub, request.params.documentId, request.body)
    return sendSuccess(reply, { statusCode: 201, message: 'Bookmarked', data: { bookmark } })
  }

  removeBookmark = async (request: FastifyRequest<{ Params: BookmarkParams }>, reply: FastifyReply) => {
    await this.playbackService.removeBookmark(request.user.sub, request.params.bookmarkId)
    return sendSuccess(reply, { message: 'Bookmark removed' })
  }
}
