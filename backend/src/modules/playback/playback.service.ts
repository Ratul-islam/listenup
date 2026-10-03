import { MAX_LISTEN_REPORT_SECONDS, PREFETCH_CHUNKS, SIGNED_URL_TTL_SECONDS, STREAK_MIN_SECONDS } from '../../config/constants.js'
import type { DocumentChunk } from '../../generated/prisma/client.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import type { Lang } from '../ingestion/text/language.js'
import type { TtsService } from '../tts/tts.service.js'
import type { VoicesService } from '../voices/voices.service.js'
import type { PlaybackRepository } from './playback.repository.js'
import type { BookmarkBody, ProgressBody } from './playback.schema.js'

const shiftDay = (day: string, delta: number) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export class PlaybackService {
  constructor(
    private readonly playbackRepository: PlaybackRepository,
    private readonly voicesService: VoicesService,
    private readonly ttsService: TtsService,
  ) {}

  private async readyDocument(userId: string, documentId: string) {
    const doc = await this.playbackRepository.findReadyDocument(userId, documentId)
    if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
    if (doc.status !== 'READY') throw new AppError('This document is still being prepared', 409, 'DOCUMENT_NOT_READY')
    return doc
  }

  /**
   * Audio for one chunk, generating it on first request. Also starts preparing
   * the next few chunks so playback continues without gaps.
   */
  async audio(userId: string, documentId: string, index: number, voiceId?: string) {
    const doc = await this.readyDocument(userId, documentId)
    const chunk = await this.playbackRepository.findChunk(documentId, index)
    if (!chunk) throw new AppError('That part of the document does not exist', 404, 'CHUNK_NOT_FOUND')

    const prefs = await this.voicesService.getPreferences(userId)
    const chosen = voiceId ?? doc.playback[0]?.voiceId
    const voice = this.voicesService.resolve(chosen, chunk.language as Lang, prefs)
    const clip = await this.ttsService.ensureClip(userId, chunk, voice)

    this.prefetch(userId, documentId, index + 1, chosen, prefs)

    return {
      index,
      voiceId: voice.id,
      language: chunk.language,
      durationMs: clip.durationMs,
      mimeType: clip.mimeType,
      url: await storage.signedUrl(clip.storageKey, SIGNED_URL_TTL_SECONDS),
    }
  }

  private prefetch(userId: string, documentId: string, from: number, chosen: string | null | undefined, prefs: Awaited<ReturnType<VoicesService['getPreferences']>>) {
    void (async () => {
      const chunks: DocumentChunk[] = await this.playbackRepository.findChunks(documentId, from, PREFETCH_CHUNKS)
      for (const chunk of chunks) {
        const voice = this.voicesService.resolve(chosen, chunk.language as Lang, prefs)
        await this.ttsService.ensureClip(userId, chunk, voice)
      }
    })().catch((e) => {
      if ((e as { code?: string }).code !== 'USAGE_LIMIT_REACHED') console.warn('[playback] prefetch failed', e)
    })
  }

  async saveProgress(userId: string, documentId: string, body: ProgressBody) {
    const doc = await this.readyDocument(userId, documentId)
    const chunkIndex = Math.min(body.chunkIndex, Math.max(doc.chunkCount - 1, 0))
    const listened = Math.min(body.listenedSec, MAX_LISTEN_REPORT_SECONDS)

    const [state] = await Promise.all([
      this.playbackRepository.upsertState(userId, documentId, {
        chunkIndex,
        offsetMs: body.offsetMs,
        voiceId: body.voiceId,
        speed: body.speed,
        ...(body.completed !== undefined && { completedAt: body.completed ? new Date() : null }),
      }),
      listened > 0 ? this.playbackRepository.addListening(userId, body.day, Math.round(listened)) : null,
    ])
    return state
  }

  /** Minutes today, the daily goal, and the current streak of listening days */
  async stats(userId: string, today: string) {
    const [days, prefs] = await Promise.all([
      this.playbackRepository.recentDays(userId, 400),
      this.voicesService.getPreferences(userId),
    ])
    const seconds = new Map(days.map((d) => [d.day, d.seconds]))
    const todaySec = seconds.get(today) ?? 0

    // A streak survives until the end of today even if today has no listening yet
    let cursor = todaySec >= STREAK_MIN_SECONDS ? today : shiftDay(today, -1)
    let streakDays = 0
    while ((seconds.get(cursor) ?? 0) >= STREAK_MIN_SECONDS) {
      streakDays++
      cursor = shiftDay(cursor, -1)
    }

    const goalSec = prefs.dailyGoalMinutes * 60
    return {
      todaySec,
      dailyGoalMinutes: prefs.dailyGoalMinutes,
      goalFraction: goalSec ? Math.min(todaySec / goalSec, 1) : 0,
      streakDays,
    }
  }

  async listBookmarks(userId: string, documentId: string) {
    await this.readyDocument(userId, documentId)
    return this.playbackRepository.listBookmarks(userId, documentId)
  }

  async addBookmark(userId: string, documentId: string, body: BookmarkBody) {
    await this.readyDocument(userId, documentId)
    return this.playbackRepository.createBookmark({ userId, documentId, ...body })
  }

  async removeBookmark(userId: string, bookmarkId: string) {
    const { count } = await this.playbackRepository.deleteBookmark(userId, bookmarkId)
    if (!count) throw new AppError('Bookmark not found', 404, 'BOOKMARK_NOT_FOUND')
  }
}
