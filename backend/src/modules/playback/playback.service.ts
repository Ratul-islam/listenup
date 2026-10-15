import { MAX_LISTEN_REPORT_SECONDS, PREFETCH_CHUNKS, SIGNED_URL_TTL_SECONDS, STREAK_MIN_SECONDS } from '../../config/constants.js'
import type { DocumentChunk } from '../../generated/prisma/client.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import type { Lang } from '../ingestion/text/language.js'
import type { Lexicon } from '../pronunciations/lexicon.js'
import type { TtsService } from '../tts/tts.service.js'
import { ownVoiceIsPrivate } from '../voices/own-voice.js'
import { isServerVoice } from '../voices/voice-catalog.js'
import { NO_EXPRESSIONS, readExpressions, sliceExpressions } from '../expressions/expression-catalog.js'
import { planAtLeast } from '../plans/plan-catalog.js'
import { lexiconFor } from '../pronunciations/lexicon-cache.js'
import { mainLanguage, type VoicesService } from '../voices/voices.service.js'
import type { PlaybackRepository } from './playback.repository.js'
import type { BookmarkBody, ProgressBody, VoiceNoteBody } from './playback.schema.js'

// Spoken at the end of Free-plan voice notes
const NOTE_TAG: Record<Lang, string> = {
  en: 'Made with ListenUp.',
  bn: 'ListenUp দিয়ে তৈরি।',
  hi: 'ListenUp से बनाया गया।',
  es: 'Hecho con ListenUp.',
  pt: 'Feito com ListenUp.',
  fr: 'Créé avec ListenUp.',
  it: 'Creato con ListenUp.',
  ja: 'ListenUpで作成しました。',
  zh: '由 ListenUp 制作。',
  ur: 'ListenUp کے ساتھ بنایا گیا۔',
  id: 'Dibuat dengan ListenUp.',
}
const NOTE_URL_TTL_SECONDS = 60 * 60

/** "ListenUp – The first few words.mp3" */
const noteFileName = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  // Japanese and Chinese have no spaces between words: take the first characters instead
  const words = flat.includes(' ') ? flat.split(' ').slice(0, 6).join(' ') : flat.slice(0, 20)
  const safe = words.replace(/[\\/:*?"<>|]/g, '').slice(0, 60).trim()
  return `ListenUp – ${safe || 'voice note'}.mp3`
}

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
    /** After listening time is recorded (e.g. to give an invite's reward once the friend has listened) */
    private readonly onListened: (userId: string) => Promise<unknown> = async () => {},
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

    const [prefs, lexicon] = await Promise.all([this.voicesService.getPreferences(userId, documentId), lexiconFor(userId)])
    const chosen = voiceId ?? doc.playback[0]?.voiceId
    // In a document that's mostly one language, its voice reads the rest too when it can
    const main = mainLanguage(doc.language)
    const voice = this.voicesService.forPart(chunk, this.voicesService.resolve(chosen, chunk.language as Lang, prefs, main), prefs)
    if (!isServerVoice(voice)) throw new AppError('Phone voices play on the device, not from the server.', 400, 'PHONE_VOICE')
    const clip = await this.ttsService.ensureClip(userId, chunk, voice, lexicon)

    this.prefetch(userId, documentId, index + 1, chosen, prefs, lexicon, main)

    const [url, anchors] = await Promise.all([
      storage.signedUrl(clip.storageKey, SIGNED_URL_TTL_SECONDS),
      // The highlight works without them, so a failure here never stops playback
      this.ttsService.anchorsFor(clip, chunk).catch(() => null),
    ])
    return {
      index,
      voiceId: voice.id,
      language: chunk.language,
      durationMs: clip.durationMs,
      mimeType: clip.mimeType,
      url,
      /** Where the text is spoken: [character, ms] points the highlight moves between; null when not known */
      anchors,
    }
  }

  private prefetch(
    userId: string,
    documentId: string,
    from: number,
    chosen: string | null | undefined,
    prefs: Awaited<ReturnType<VoicesService['getPreferences']>>,
    lexicon: Lexicon,
    main: Lang | null,
  ) {
    void (async () => {
      const chunks: DocumentChunk[] = await this.playbackRepository.findChunks(documentId, from, PREFETCH_CHUNKS)
      // Side by side, so a short part (the first one is) doesn't finish before the one after it is voiced
      await Promise.all(
        chunks.map((chunk) => {
          const voice = this.voicesService.forPart(chunk, this.voicesService.resolve(chosen, chunk.language as Lang, prefs, main), prefs)
          return isServerVoice(voice) ? this.ttsService.ensureClip(userId, chunk, voice, lexicon) : null
        }),
      )
    })().catch((e) => {
      if ((e as { code?: string }).code !== 'USAGE_LIMIT_REACHED') console.warn('[playback] prefetch failed', e)
    })
  }

  /**
   * Part of one chunk voiced on its own, with the listener's emotions, in the
   * document's voice: a voice note, or a clip posted to Explore. Phone voices
   * can't be voiced here, and a clip for Explore (`builtInOnly`) can't be in
   * the listener's own voice, which stays private.
   */
  async voiceClip(userId: string, documentId: string, { chunkIndex, start, end, voiceId }: VoiceNoteBody, maxChars = Infinity, builtInOnly = false) {
    const doc = await this.readyDocument(userId, documentId)
    const chunk = await this.playbackRepository.findChunk(documentId, chunkIndex)
    if (!chunk) throw new AppError('That part of the document does not exist', 404, 'CHUNK_NOT_FOUND')
    const from = Math.min(start, chunk.text.length)
    const to = Math.min(end, chunk.text.length)
    const text = chunk.text.slice(from, to).trim()
    if (!text) throw new AppError('Pick some text to send', 400, 'EMPTY_SELECTION')
    if (text.length > maxChars) throw new AppError(`That's too long for a clip. Pick a line or a short paragraph (up to ${maxChars} characters).`, 400, 'CLIP_TOO_LONG')
    const lead = chunk.text.slice(from, to).indexOf(text)

    // Not scoped to the document: a voice note is a file that leaves the app, so a speaker's voice never makes one
    const prefs = await this.voicesService.getPreferences(userId)
    const voice = this.voicesService.forPart(chunk, this.voicesService.resolve(voiceId ?? doc.playback[0]?.voiceId, chunk.language as Lang, prefs, mainLanguage(doc.language)), prefs)
    if (!isServerVoice(voice)) throw new AppError('Phone voices make voice notes on the device.', 400, 'PHONE_VOICE')
    if (builtInOnly && voice.own) throw ownVoiceIsPrivate()

    const expressions = sliceExpressions(readExpressions(chunk.expressions), from + lead, from + lead + text.length)
    const audio = await this.ttsService.voiceText(userId, text, expressions, voice, chunk.narration, await lexiconFor(userId))
    return { doc, text, voice, audio }
  }

  /**
   * A sentence or paragraph as an MP3 to share (e.g. a WhatsApp voice note),
   * with the listener's emotions. Free plans end with "Made with ListenUp".
   * Phone voices make voice notes on the device instead.
   */
  async voiceNote(userId: string, documentId: string, body: VoiceNoteBody) {
    const { text, voice, audio } = await this.voiceClip(userId, documentId, body)
    let note = audio
    const free = !planAtLeast((await this.playbackRepository.findUserPlan(userId))?.plan, 'plus')
    if (free && note.mimeType === 'audio/mpeg') {
      const tag = await this.ttsService.voiceText(null, NOTE_TAG[voice.language], NO_EXPRESSIONS, voice)
      note = await this.ttsService.joinMp3([note, tag])
    }
    return {
      url: await storage.signedUrl(note.storageKey, NOTE_URL_TTL_SECONDS),
      durationMs: note.durationMs,
      mimeType: note.mimeType,
      fileName: noteFileName(text),
    }
  }

  async saveProgress(userId: string, documentId: string, body: ProgressBody) {
    const [doc, listened] = await Promise.all([this.readyDocument(userId, documentId), this.creditListening(userId, body.listenedSec)])
    const chunkIndex = Math.min(body.chunkIndex, Math.max(doc.chunkCount - 1, 0))

    const [state] = await Promise.all([
      this.playbackRepository.upsertState(userId, documentId, {
        chunkIndex,
        offsetMs: body.offsetMs,
        voiceId: body.voiceId,
        speed: body.speed,
        listenedSec: Math.round(listened),
        ...(body.completed !== undefined && { completedAt: body.completed ? new Date() : null }),
      }),
      listened > 0 ? this.playbackRepository.addListening(userId, body.day, Math.round(listened)) : null,
    ])
    if (listened > 0) this.onListened(userId).catch((e) => console.warn('[playback] after-listening check failed', e))
    return state
  }

  /**
   * How much of the reported listening counts. The app says how long it played,
   * but a report can say anything, and invite rewards, contest hearts and streaks
   * rest on it: listening is credited no faster than the clock runs (a second a
   * second across all of a user's documents), with up to
   * MAX_LISTEN_REPORT_SECONDS of catch-up for time played offline or between
   * reports. Sending the same report again and again adds nothing.
   */
  private async creditListening(userId: string, reportedSec: number) {
    if (reportedSec < 1) return 0
    return this.playbackRepository.creditListening(userId, reportedSec, new Date(), MAX_LISTEN_REPORT_SECONDS)
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
