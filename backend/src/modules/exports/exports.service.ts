import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import type { AudioExport, DocumentChunk, OfflineDownload } from '../../generated/prisma/client.js'
import { audioFrames } from '../../lib/audio/mp3.js'
import { queue, QUEUES, startQueue, type PrepareOfflineJob } from '../../lib/queue.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { LANGS, type Lang } from '../ingestion/text/language.js'
import { planAtLeast } from '../plans/plan-catalog.js'
import { planFor, type TtsService } from '../tts/tts.service.js'
import type { UsageService } from '../usage/usage.service.js'
import { isServerVoice, type ServerTier, type VoiceDefinition } from '../voices/voice-catalog.js'
import type { VoicesService } from '../voices/voices.service.js'
import type { ExportsRepository } from './exports.repository.js'

// Bump to rebuild every MP3 (e.g. after changing how clips are joined)
const EXPORT_VERSION = 1
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60
const VOICING_CONCURRENCY = 3

const premiumRequired = () => new AppError('Downloading audio is part of Plus and Pro.', 403, 'PREMIUM_REQUIRED')

// Bump to make every offline download out of date (e.g. after changing what goes in one)
const OFFLINE_VERSION = 1
// Long enough for the app to fetch every clip after the manifest arrives
const OFFLINE_URL_TTL_SECONDS = 6 * 60 * 60

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
    // Phone voices can't be voiced here; their languages use the default server voice
    const voices = Object.fromEntries(LANGS.map((lang) => [lang, this.voicesService.resolveServer(pick, lang, prefs)])) as Record<
      Lang,
      VoiceDefinition & { tier: ServerTier }
    >
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
    const needed = { natural: 0, expressive: 0 }
    for (const c of chunks) {
      const voice = voiceFor(c)
      if (!ready.has(`${c.id}:${voice.id}:${planFor(c, voice).key}`)) needed[voice.tier] += c.estimatedDurationSec
    }
    await this.usageService.assertCovers(userId, needed)

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

  // ---- Offline downloads (Plus and up) ----

  /**
   * What an offline download contains: every chunk whose language is read by a
   * server voice. Languages on a phone voice are skipped, since the phone voices
   * those itself, offline. The fingerprint changes when any of that audio would.
   */
  private async offlinePlan(userId: string, documentId: string, voiceId: string | undefined, chunks: DocumentChunk[], chosen: string | null | undefined) {
    const prefs = await this.voicesService.getPreferences(userId)
    const pick = voiceId ?? chosen
    const voices = Object.fromEntries(LANGS.map((lang) => [lang, this.voicesService.resolve(pick, lang, prefs)])) as Record<Lang, VoiceDefinition>
    const voiced = chunks.flatMap((chunk) => {
      const voice = voices[chunk.language as Lang]
      return isServerVoice(voice) ? [{ chunk, voice, key: planFor(chunk, voice).key }] : []
    })
    const renderKey = createHash('sha256')
      .update(JSON.stringify([OFFLINE_VERSION, documentId, voiced.map((v) => `${v.voice.id}:${v.key}`)]))
      .digest('hex')
      .slice(0, 16)
    return { voiced, renderKey, pick, voices }
  }

  private offlineView(row: OfflineDownload | null, currentKey: string) {
    if (!row) return { status: 'NONE' as const }
    return {
      status: row.status,
      upToDate: row.renderKey === currentKey,
      chunksDone: row.chunksDone,
      chunkCount: row.chunkCount,
      error: row.error,
    }
  }

  private async assertPlus(userId: string) {
    if (!planAtLeast((await this.exportsRepository.findUserPlan(userId))?.plan, 'plus')) {
      throw new AppError('Offline listening is part of Plus and Pro.', 403, 'PREMIUM_REQUIRED')
    }
  }

  async offlineStatus(userId: string, documentId: string, voiceId?: string) {
    const doc = await this.ownedReady(userId, documentId)
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { renderKey } = await this.offlinePlan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId)
    return this.offlineView(doc.offline, renderKey)
  }

  /** Voices whatever is missing in the background; the app downloads the clips once it's READY */
  async startOffline(userId: string, documentId: string, voiceId?: string) {
    await this.assertPlus(userId)
    const doc = await this.ownedReady(userId, documentId)
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { voiced, renderKey, pick } = await this.offlinePlan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId)

    const current = doc.offline
    if (current && current.renderKey === renderKey && current.status !== 'FAILED') return this.offlineView(current, renderKey)

    // Only chunks without current audio cost anything
    const ready = new Set((await this.exportsRepository.readyClips(documentId)).map((c) => `${c.chunkId}:${c.voiceId}:${c.renderKey}`))
    const needed = { natural: 0, expressive: 0 }
    for (const { chunk, voice, key } of voiced) {
      if (!ready.has(`${chunk.id}:${voice.id}:${key}`)) needed[voice.tier] += chunk.estimatedDurationSec
    }
    await this.usageService.assertCovers(userId, needed)

    const jobId = randomUUID()
    const row = await this.exportsRepository.upsertOffline(documentId, {
      status: 'RUNNING',
      renderKey,
      voiceId: pick ?? null,
      jobId,
      chunksDone: 0,
      chunkCount: voiced.length,
      error: null,
    })
    await startQueue()
    await queue.send(QUEUES.prepareOffline, { documentId, jobId, voiceId: pick ?? undefined } satisfies PrepareOfflineJob)
    return this.offlineView(row, renderKey)
  }

  /** Job body: voice every chunk the download needs */
  async runOffline(documentId: string, jobId: string, voiceId: string | undefined) {
    const doc = await this.exportsRepository.findDocument(documentId)
    if (!doc || doc.status !== 'READY') return
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { voiced, renderKey } = await this.offlinePlan(doc.userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId)

    let done = 0
    let next = 0
    const worker = async () => {
      while (next < voiced.length) {
        const { chunk, voice } = voiced[next++]
        await this.ttsService.ensureClip(doc.userId, chunk, voice)
        await this.exportsRepository.updateOfflineForJob(documentId, jobId, { chunksDone: ++done })
      }
    }
    await Promise.all(Array.from({ length: Math.min(VOICING_CONCURRENCY, voiced.length) }, worker))
    await this.exportsRepository.updateOfflineForJob(documentId, jobId, { status: 'READY', renderKey, chunkCount: voiced.length, error: null })
  }

  async failOffline(documentId: string, jobId: string, error: unknown) {
    const message =
      error instanceof AppError && ['USAGE_LIMIT_REACHED', 'BUDGET_PAUSED'].includes(error.code ?? '')
        ? error.message
        : "Couldn't prepare the download. Try again in a moment."
    await this.exportsRepository.updateOfflineForJob(documentId, jobId, { status: 'FAILED', error: message }).catch(() => {})
  }

  /**
   * Links to every clip of a ready download, and the voice each language uses,
   * so the app can tell later whether its files still match what it would play.
   */
  async offlineManifest(userId: string, documentId: string, voiceId?: string) {
    await this.assertPlus(userId)
    const doc = await this.ownedReady(userId, documentId)
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { voiced, renderKey, voices } = await this.offlinePlan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId)
    if (doc.offline?.status !== 'READY' || doc.offline.renderKey !== renderKey) {
      throw new AppError('This download is out of date. Prepare it again.', 409, 'OFFLINE_NOT_READY')
    }

    const files = new Map((await this.exportsRepository.clipFiles(documentId)).map((c) => [`${c.chunkId}:${c.voiceId}:${c.renderKey}`, c]))
    const clips = []
    for (const { chunk, voice, key } of voiced) {
      const clip = files.get(`${chunk.id}:${voice.id}:${key}`)
      if (!clip?.storageKey) throw new AppError('This download is out of date. Prepare it again.', 409, 'OFFLINE_NOT_READY')
      clips.push({
        index: chunk.index,
        voiceId: voice.id,
        durationMs: clip.durationMs ?? Math.round(chunk.estimatedDurationSec * 1000),
        mimeType: clip.mimeType ?? 'audio/mpeg',
        url: await storage.signedUrl(clip.storageKey, OFFLINE_URL_TTL_SECONDS),
      })
    }
    return { renderKey, voices: Object.fromEntries(LANGS.map((lang) => [lang, voices[lang].id])), clips }
  }

  async fail(documentId: string, jobId: string, error: unknown) {
    const message =
      error instanceof AppError && error.code === 'USAGE_LIMIT_REACHED'
        ? error.message
        : "Couldn't finish the MP3. Try again in a moment."
    await this.exportsRepository.updateForJob(documentId, jobId, { status: 'FAILED', error: message }).catch(() => {})
  }
}
