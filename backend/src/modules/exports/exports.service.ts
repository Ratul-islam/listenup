import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import type { AudioExport, DocumentChunk, OfflineDownload } from '../../generated/prisma/client.js'
import { pcmToMp3 } from '../../lib/audio/encode.js'
import { audioFrames, mp3SampleRate } from '../../lib/audio/mp3.js'
import { decodeMp3, pausesIn, type Pause } from '../../lib/audio/pauses.js'
import { peaksOf } from '../../lib/audio/peaks.js'
import { buildCues, toSrt, toTranscript, toVtt, type SubtitlePart } from '../../lib/subtitles.js'
import { queue, QUEUES, startQueue, type PrepareOfflineJob } from '../../lib/queue.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { LANGS, type Lang } from '../ingestion/text/language.js'
import { planAtLeast } from '../plans/plan-catalog.js'
import { lexiconFor } from '../pronunciations/lexicon-cache.js'
import type { Lexicon } from '../pronunciations/lexicon.js'
import { planFor, type TtsService } from '../tts/tts.service.js'
import type { UsageService } from '../usage/usage.service.js'
import { isServerVoice, type ServerTier, type VoiceDefinition } from '../voices/voice-catalog.js'
import type { VoicesService } from '../voices/voices.service.js'
import type { ExportsRepository } from './exports.repository.js'

// Bump to rebuild every MP3 (e.g. after changing how clips are joined). 2: subtitles. 3: pauses, short captions, script text
const EXPORT_VERSION = 3
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60
const VOICING_CONCURRENCY = 3

const premiumRequired = () => new AppError('Downloading audio is part of Plus and Pro.', 403, 'PREMIUM_REQUIRED')

// Bump to make every offline download out of date (e.g. after changing what goes in one)
const OFFLINE_VERSION = 1
// Long enough for the app to fetch every clip after the manifest arrives
const OFFLINE_URL_TTL_SECONDS = 6 * 60 * 60

/** Files made with every MP3, next to it: subtitles in two sizes and two formats, and the script as text */
const EXTRAS = ['srt', 'vtt', 'short.srt', 'short.vtt', 'txt'] as const
type Extra = (typeof EXTRAS)[number]
const subtitleKey = (mp3Key: string, ext: Extra) => mp3Key.replace(/\.mp3$/, `.${ext}`)

/** Silence in the MP3's own format, for pauses after parts */
const silenceFrames = (ms: number, sampleRate: number) => audioFrames(pcmToMp3(Buffer.alloc(Math.round((ms / 1000) * sampleRate) * 2), sampleRate))

type ServerVoice = VoiceDefinition & { tier: ServerTier }

// A running export or download touches its row as each part is voiced (and while joining).
// One silent for this long was stopped by a crash or restart: its pg-boss job would only
// expire hours later, so the app showed a frozen "Voicing part 3 of 10…" until then.
const STALLED_MS = 5 * 60_000
const STOPPED_MESSAGE = 'This stopped part-way (the server restarted). Start it again: parts already voiced are kept and cost nothing.'
const stalled = (row: { status: string; updatedAt: Date } | null) => row?.status === 'RUNNING' && Date.now() - row.updatedAt.getTime() > STALLED_MS
// While joining, refresh the row every this many parts so a long join doesn't look stalled
const JOIN_HEARTBEAT_PARTS = 25

/**
 * "Download as MP3" (Plus and up): voices any chunks that have no audio yet,
 * joins every chunk into one MP3 in storage with SRT and VTT subtitles, and
 * keeps them until the audio would change (text, voice, emotions,
 * pronunciations), so repeat downloads are free. Parts that already have
 * current audio are reused, so after an edit only the changed parts cost minutes.
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
    const [prefs, lexicon] = await Promise.all([this.voicesService.getPreferences(userId), lexiconFor(userId)])
    const pick = voiceId ?? chosen
    // Phone voices can't be voiced here; their languages use the default server voice
    const voices = Object.fromEntries(LANGS.map((lang) => [lang, this.voicesService.resolveServer(pick, lang, prefs)])) as Record<Lang, ServerVoice>
    const voiceFor = (c: DocumentChunk) => this.voicesService.forPartServer(c, voices[c.language as Lang])
    // Pauses after parts are part of the MP3 too
    const keys = chunks.map((c) => `${voiceFor(c).id}:${planFor(c, voiceFor(c), lexicon).key}:${c.pauseAfterMs}`)
    const renderKey = createHash('sha256').update(JSON.stringify([EXPORT_VERSION, documentId, keys])).digest('hex').slice(0, 16)
    return { voiceFor, renderKey, pick, lexicon }
  }

  /**
   * How much of the document still needs voicing, against how much is reused:
   * what an edit or a new take really costs.
   */
  private async voicing(documentId: string, items: { chunk: DocumentChunk; voice: ServerVoice }[], lexicon: Lexicon) {
    const ready = new Set((await this.exportsRepository.readyClips(documentId)).map((c) => `${c.chunkId}:${c.voiceId}:${c.renderKey}`))
    const needed = { natural: 0, expressive: 0 }
    let parts = 0
    for (const { chunk, voice } of items) {
      if (ready.has(`${chunk.id}:${voice.id}:${planFor(chunk, voice, lexicon).key}`)) continue
      needed[voice.tier] += chunk.estimatedDurationSec
      parts++
    }
    return {
      needed,
      summary: {
        /** Parts without current audio, and roughly how long they are */
        partsToVoice: parts,
        secondsToVoice: Math.round(needed.natural + needed.expressive),
        partCount: items.length,
        totalSeconds: Math.round(items.reduce((n, i) => n + i.chunk.estimatedDurationSec, 0)),
      },
    }
  }

  private async view(row: AudioExport | null, currentKey: string, userId: string, voicing: Awaited<ReturnType<ExportsService['voicing']>>['summary']) {
    if (!row) return { status: 'NONE' as const, voicing }
    const upToDate = row.renderKey === currentKey
    const canDownload = row.status === 'READY' && row.storageKey && planAtLeast((await this.exportsRepository.findUserPlan(userId))?.plan, 'plus')
    const link = (key: string) => storage.signedUrl(key, DOWNLOAD_URL_TTL_SECONDS)
    return {
      status: row.status,
      upToDate,
      chunksDone: row.chunksDone,
      chunkCount: row.chunkCount,
      sizeBytes: row.sizeBytes,
      durationMs: row.durationMs,
      error: row.error,
      url: canDownload ? await link(row.storageKey!) : null,
      subtitles: canDownload
        ? {
            srt: await link(subtitleKey(row.storageKey!, 'srt')),
            vtt: await link(subtitleKey(row.storageKey!, 'vtt')),
            /** One short line per caption, for Reels, Shorts and TikTok */
            shortSrt: await link(subtitleKey(row.storageKey!, 'short.srt')),
            shortVtt: await link(subtitleKey(row.storageKey!, 'short.vtt')),
          }
        : null,
      /** The script as plain text, for a video description */
      transcript: canDownload ? await link(subtitleKey(row.storageKey!, 'txt')) : null,
      voicing,
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
    const { renderKey, voiceFor, lexicon } = await this.plan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId)
    const { summary } = await this.voicing(documentId, chunks.map((chunk) => ({ chunk, voice: voiceFor(chunk) })), lexicon)
    let row = doc.export
    if (row && stalled(row)) row = (await this.exportsRepository.markStopped(documentId, row.jobId, STOPPED_MESSAGE)) ?? row
    return this.view(row, renderKey, userId, summary)
  }

  async start(userId: string, documentId: string, voiceId?: string) {
    if (!planAtLeast((await this.exportsRepository.findUserPlan(userId))?.plan, 'plus')) throw premiumRequired()
    const doc = await this.ownedReady(userId, documentId)
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { voiceFor, renderKey, pick, lexicon } = await this.plan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId)
    const { needed, summary } = await this.voicing(documentId, chunks.map((chunk) => ({ chunk, voice: voiceFor(chunk) })), lexicon)

    // Already built (or building) for exactly this audio: reuse it
    const current = doc.export
    if (current && current.renderKey === renderKey && current.status !== 'FAILED' && !stalled(current)) return this.view(current, renderKey, userId, summary)

    // Only chunks without current audio cost anything; refuse up front if the allowance can't cover them
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
    return this.view(row, renderKey, userId, summary)
  }

  /**
   * Job body: voice what's missing, then stream the joined MP3 into storage.
   * If a newer export starts meanwhile, this one's result is discarded.
   */
  async run(documentId: string, jobId: string, voiceId: string | undefined) {
    const doc = await this.exportsRepository.findDocument(documentId)
    if (!doc || doc.status !== 'READY') return
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { voiceFor, renderKey, lexicon } = await this.plan(doc.userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId)

    let done = 0
    let next = 0
    const clips = new Array<Awaited<ReturnType<TtsService['ensureClip']>>>(chunks.length)
    const worker = async () => {
      while (next < chunks.length) {
        const i = next++
        clips[i] = await this.ttsService.ensureClip(doc.userId, chunks[i], voiceFor(chunks[i]), lexicon, { background: true })
        await this.exportsRepository.updateForJob(documentId, jobId, { chunksDone: ++done })
      }
    }
    await Promise.all(Array.from({ length: Math.min(VOICING_CONCURRENCY, chunks.length) }, worker))
    await this.remakeMissing(doc.userId, chunks, clips, (c) => voiceFor(c), lexicon)

    if (clips.some((c) => c.mimeType !== 'audio/mpeg')) {
      throw new AppError('MP3 export needs the real speech provider (the dev mock voice makes WAV)', 500, 'EXPORT_UNSUPPORTED')
    }

    const storageKey = `exports/${documentId}/${renderKey}.mp3`
    // Silences found before are kept with the shared audio, so a re-export only listens to new parts
    const known = await this.exportsRepository.blobPauses(clips.flatMap((c) => (c.blobHash ? [c.blobHash] : [])))
    const pauses: Pause[][] = []
    let sizeBytes = 0
    const exportsRepository = this.exportsRepository
    async function* parts() {
      for (const [i, clip] of clips.entries()) {
        if (i % JOIN_HEARTBEAT_PARTS === 0) await exportsRepository.updateForJob(documentId, jobId, { chunksDone: chunks.length })
        const file = await storage.get(clip.storageKey)
        const saved = clip.blobHash ? known.get(clip.blobHash) : undefined
        if (saved) pauses[i] = saved
        else {
          // Older audio: measure it now, and keep its waveform for Studio too
          const decoded = await decodeMp3(file).catch(() => null)
          pauses[i] = decoded ? pausesIn(decoded) : []
          if (decoded && clip.blobHash) await exportsRepository.saveAnalysis(clip.blobHash, pauses[i], peaksOf(decoded)).catch(() => {})
        }
        const frames = audioFrames(file)
        sizeBytes += frames.length
        yield frames
        // The creator's pause after this part
        const rate = chunks[i].pauseAfterMs > 0 ? mp3SampleRate(file) : null
        if (rate) {
          const silence = silenceFrames(chunks[i].pauseAfterMs, rate)
          sizeBytes += silence.length
          yield silence
        }
      }
    }
    await storage.putStream(storageKey, Readable.from(parts()), 'audio/mpeg')

    // Subtitles show the script as written, timed to the joined recording
    let offsetMs = 0
    const subtitleParts: SubtitlePart[] = chunks.map((chunk, i) => {
      const part = {
        text: chunk.text,
        sentences: chunk.sentences as unknown as SubtitlePart['sentences'],
        offsetMs,
        durationMs: clips[i].durationMs,
        pauses: pauses[i] ?? [],
        cjk: chunk.language === 'ja' || chunk.language === 'zh',
      }
      offsetMs += clips[i].durationMs + chunk.pauseAfterMs
      return part
    })
    const cues = buildCues(subtitleParts)
    const short = buildCues(subtitleParts, 'short')
    const files: Record<Extra, [string, string]> = {
      srt: [toSrt(cues), 'application/x-subrip'],
      vtt: [toVtt(cues), 'text/vtt'],
      'short.srt': [toSrt(short), 'application/x-subrip'],
      'short.vtt': [toVtt(short), 'text/vtt'],
      txt: [toTranscript(chunks), 'text/plain; charset=utf-8'],
    }
    await Promise.all(EXTRAS.map((ext) => storage.put(subtitleKey(storageKey, ext), Buffer.from(files[ext][0], 'utf8'), files[ext][1])))

    const before = (await this.exportsRepository.findDocument(documentId))?.export?.storageKey ?? null
    const latest = await this.exportsRepository.updateForJob(documentId, jobId, {
      status: 'READY',
      // What was actually built, in case the document changed after the export was requested
      renderKey,
      storageKey,
      sizeBytes,
      durationMs: clips.reduce((ms, c, i) => ms + c.durationMs + chunks[i].pauseAfterMs, 0),
      error: null,
    })
    // Remove whichever files are no longer the document's MP3 and subtitles
    const unused = latest ? before : storageKey
    if (unused && unused !== (latest ? storageKey : before)) {
      await Promise.all([unused, ...EXTRAS.map((ext) => subtitleKey(unused, ext))].map((key) => storage.delete(key).catch(() => {})))
    }
  }

  /**
   * Makes sure every part's audio file is really in storage before joining. A
   * file that went missing (lost storage, a cleanup race) is made again, at our
   * cost, instead of failing the export on every retry.
   */
  private async remakeMissing(
    userId: string,
    chunks: DocumentChunk[],
    clips: Awaited<ReturnType<TtsService['ensureClip']>>[],
    voiceFor: (c: DocumentChunk) => VoiceDefinition,
    lexicon: Lexicon,
  ) {
    for (let i = 0; i < clips.length; i++) {
      if (await storage.exists(clips[i].storageKey)) continue
      console.warn(`[exports] audio for part ${i} of ${chunks[i].documentId} is missing; making it again`)
      await this.ttsService.forgetMissing(clips[i])
      clips[i] = await this.ttsService.ensureClip(userId, chunks[i], voiceFor(chunks[i]), lexicon, { background: true, free: true })
    }
  }

  // ---- Offline downloads (Plus and up) ----

  /**
   * What an offline download contains: every chunk whose language is read by a
   * server voice. Languages on a phone voice are skipped, since the phone voices
   * those itself, offline. The fingerprint changes when any of that audio would.
   */
  private async offlinePlan(userId: string, documentId: string, voiceId: string | undefined, chunks: DocumentChunk[], chosen: string | null | undefined) {
    const [prefs, lexicon] = await Promise.all([this.voicesService.getPreferences(userId), lexiconFor(userId)])
    const pick = voiceId ?? chosen
    const voices = Object.fromEntries(LANGS.map((lang) => [lang, this.voicesService.resolve(pick, lang, prefs)])) as Record<Lang, VoiceDefinition>
    const voiced = chunks.flatMap((chunk) => {
      const voice = this.voicesService.forPart(chunk, voices[chunk.language as Lang])
      return isServerVoice(voice) ? [{ chunk, voice, key: planFor(chunk, voice, lexicon).key }] : []
    })
    const renderKey = createHash('sha256')
      .update(JSON.stringify([OFFLINE_VERSION, documentId, voiced.map((v) => `${v.voice.id}:${v.key}`)]))
      .digest('hex')
      .slice(0, 16)
    return { voiced, renderKey, pick, voices, lexicon }
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
    let row = doc.offline
    if (row && stalled(row)) row = (await this.exportsRepository.markOfflineStopped(documentId, row.jobId, STOPPED_MESSAGE)) ?? row
    return this.offlineView(row, renderKey)
  }

  /** Voices whatever is missing in the background; the app downloads the clips once it's READY */
  async startOffline(userId: string, documentId: string, voiceId?: string) {
    await this.assertPlus(userId)
    const doc = await this.ownedReady(userId, documentId)
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { voiced, renderKey, pick } = await this.offlinePlan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId)

    const current = doc.offline
    if (current && current.renderKey === renderKey && current.status !== 'FAILED' && !stalled(current)) return this.offlineView(current, renderKey)

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
    const { voiced, renderKey, lexicon } = await this.offlinePlan(doc.userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId)

    let done = 0
    let next = 0
    const clips = new Array<Awaited<ReturnType<TtsService['ensureClip']>>>(voiced.length)
    const worker = async () => {
      while (next < voiced.length) {
        const i = next++
        const { chunk, voice } = voiced[i]
        clips[i] = await this.ttsService.ensureClip(doc.userId, chunk, voice, lexicon, { background: true })
        await this.exportsRepository.updateOfflineForJob(documentId, jobId, { chunksDone: ++done })
      }
    }
    await Promise.all(Array.from({ length: Math.min(VOICING_CONCURRENCY, voiced.length) }, worker))
    const voiceOf = new Map(voiced.map((v) => [v.chunk.id, v.voice]))
    await this.remakeMissing(doc.userId, voiced.map((v) => v.chunk), clips, (c) => voiceOf.get(c.id)!, lexicon)
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
      error instanceof AppError && ['USAGE_LIMIT_REACHED', 'BUDGET_PAUSED'].includes(error.code ?? '')
        ? error.message
        : "Couldn't finish the MP3. Try again in a moment: parts already voiced are kept."
    await this.exportsRepository.updateForJob(documentId, jobId, { status: 'FAILED', error: message }).catch(() => {})
  }
}
