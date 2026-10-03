import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import type { AudioExport, DocumentChunk } from '../../generated/prisma/client.js'
import { audioFrames } from '../../lib/audio/mp3.js'
import { queue, QUEUES, startQueue } from '../../lib/queue.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import type { Lang } from '../ingestion/text/language.js'
import { planAtLeast } from '../plans/plan-catalog.js'
import { planFor, type TtsService } from '../tts/tts.service.js'
import type { UsageService } from '../usage/usage.service.js'
import type { VoiceDefinition } from '../voices/voice-catalog.js'
import type { VoicesService } from '../voices/voices.service.js'
import type { ExportsRepository } from './exports.repository.js'

// Bump to rebuild every MP3 (e.g. after changing how clips are joined)
const EXPORT_VERSION = 1
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60
const VOICING_CONCURRENCY = 3

const premiumRequired = () => new AppError('Downloading audio is part of Plus and Pro.', 403, 'PREMIUM_REQUIRED')

/**
 * "Download as MP3" (Plus and up): voices any chunks that have no audio yet,
 * joins every chunk into one MP3 in storage, and keeps it until the audio
 * would change (voice, emotions, re-import), so repeat downloads are free.
 */
export class ExportsService {
  constructor(
    private readonly exportsRepository: ExportsRepository,
    private readonly voicesService: VoicesService,
    private readonly usageService: UsageService,
    private readonly ttsService: TtsService,
  ) {}

  /** The document as it would be voiced now: which voice per chunk, and the MP3's fingerprint */
  private async plan(userId: string, documentId: string, voiceId: string | undefined, chunks: DocumentChunk[], chosen: string | null | undefined) {
    const prefs = await this.voicesService.getPreferences(userId)
    const pick = voiceId ?? chosen
    const voices: Record<Lang, VoiceDefinition> = {
      en: this.voicesService.resolve(pick, 'en', prefs),
      bn: this.voicesService.resolve(pick, 'bn', prefs),
    }
    const voiceFor = (c: DocumentChunk) => voices[c.language as Lang]
    const keys = chunks.map((c) => `${voiceFor(c).id}:${planFor(c, voiceFor(c)).key}`)
    const renderKey = createHash('sha256').update(JSON.stringify([EXPORT_VERSION, documentId, keys])).digest('hex').slice(0, 16)
    return { voiceFor, renderKey, pick }
  }

  private async view(row: AudioExport | null, currentKey: string, userId: string) {
    if (!row) return { status: 'NONE' as const }
    const upToDate = row.renderKey === currentKey
    const canDownload = row.status === 'READY' && row.storageKey && planAtLeast((await this.exportsRepository.findUserPlan(userId))?.plan, 'plus')
    return {
      status: row.status,
      upToDate,
      chunksDone: row.chunksDone,
      chunkCount: row.chunkCount,
      sizeBytes: row.sizeBytes,
      durationMs: row.durationMs,
      error: row.error,
      url: canDownload ? await storage.signedUrl(row.storageKey!, DOWNLOAD_URL_TTL_SECONDS) : null,
    }
  }

  private async ownedReady(userId: string, documentId: string) {
    const doc = await this.exportsRepository.findOwnedDocument(userId, documentId)
    if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
    if (doc.status !== 'READY') throw new AppError('This document is still being prepared', 409, 'DOCUMENT_NOT_READY')
    return doc
  }

  async status(userId: string, documentId: string, voiceId?: string) {
    const doc = await this.ownedReady(userId, documentId)
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { renderKey } = await this.plan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId)
    return this.view(doc.export, renderKey, userId)
  }

  async start(userId: string, documentId: string, voiceId?: string) {
    if (!planAtLeast((await this.exportsRepository.findUserPlan(userId))?.plan, 'plus')) throw premiumRequired()
    const doc = await this.ownedReady(userId, documentId)
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { voiceFor, renderKey, pick } = await this.plan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId)

    // Already built (or building) for exactly this audio: reuse it
    const current = doc.export
    if (current && current.renderKey === renderKey && current.status !== 'FAILED') return this.view(current, renderKey, userId)

    // Only chunks without current audio cost anything; refuse up front if the allowance can't cover them
    const ready = new Set((await this.exportsRepository.readyClips(documentId)).map((c) => `${c.chunkId}:${c.voiceId}:${c.renderKey}`))
    const missingChars = chunks
      .filter((c) => !ready.has(`${c.id}:${voiceFor(c).id}:${planFor(c, voiceFor(c)).key}`))
      .reduce((n, c) => n + c.text.length, 0)
    const { remainingCharacters } = await this.usageService.summary(userId)
    if (missingChars > remainingCharacters) {
      throw new AppError(
        "There isn't enough listening time left this month to voice the rest of this document. It resets on the 1st.",
        402,
        'USAGE_LIMIT_REACHED',
      )
    }

    const jobId = randomUUID()
    const row = await this.exportsRepository.upsert(documentId, {
      status: 'RUNNING',
      renderKey,
      voiceId: pick ?? null,
      jobId,
      chunksDone: 0,
      chunkCount: chunks.length,
      error: null,
      storageKey: current?.storageKey ?? null,
    })
    await startQueue()
    await queue.send(QUEUES.exportAudio, { documentId, jobId, voiceId: pick ?? undefined })
    return this.view(row, renderKey, userId)
  }

  /**
   * Job body: voice what's missing, then stream the joined MP3 into storage.
   * If a newer export starts meanwhile, this one's result is discarded.
   */
  async run(documentId: string, jobId: string, voiceId: string | undefined) {
    const doc = await this.exportsRepository.findDocument(documentId)
    if (!doc || doc.status !== 'READY') return
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { voiceFor, renderKey } = await this.plan(doc.userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId)

    let done = 0
    let next = 0
    const clips = new Array<Awaited<ReturnType<TtsService['ensureClip']>>>(chunks.length)
    const worker = async () => {
      while (next < chunks.length) {
        const i = next++
        clips[i] = await this.ttsService.ensureClip(doc.userId, chunks[i], voiceFor(chunks[i]))
        await this.exportsRepository.updateForJob(documentId, jobId, { chunksDone: ++done })
      }
    }
    await Promise.all(Array.from({ length: Math.min(VOICING_CONCURRENCY, chunks.length) }, worker))

    if (clips.some((c) => c.mimeType !== 'audio/mpeg')) {
      throw new AppError('MP3 export needs the real speech provider (the dev mock voice makes WAV)', 500, 'EXPORT_UNSUPPORTED')
    }

    const storageKey = `exports/${documentId}/${renderKey}.mp3`
    let sizeBytes = 0
    async function* parts() {
      for (const clip of clips) {
        const frames = audioFrames(await storage.get(clip.storageKey))
        sizeBytes += frames.length
        yield frames
      }
    }
    await storage.putStream(storageKey, Readable.from(parts()), 'audio/mpeg')

    const before = (await this.exportsRepository.findDocument(documentId))?.export?.storageKey ?? null
    const latest = await this.exportsRepository.updateForJob(documentId, jobId, {
      status: 'READY',
      // What was actually built, in case the document changed after the export was requested
      renderKey,
      storageKey,
      sizeBytes,
      durationMs: clips.reduce((ms, c) => ms + c.durationMs, 0),
      error: null,
    })
    // Remove whichever file is no longer the document's MP3
    const unused = latest ? before : storageKey
    if (unused && unused !== (latest ? storageKey : before)) await storage.delete(unused).catch(() => {})
  }

  async fail(documentId: string, jobId: string, error: unknown) {
    const message =
      error instanceof AppError && error.code === 'USAGE_LIMIT_REACHED'
        ? error.message
        : "Couldn't finish the MP3. Try again in a moment."
    await this.exportsRepository.updateForJob(documentId, jobId, { status: 'FAILED', error: message }).catch(() => {})
  }
}
