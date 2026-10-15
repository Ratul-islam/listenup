import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import type { AudioExport, DocumentChunk, OfflineDownload } from '../../generated/prisma/client.js'
import { pcmToMp3 } from '../../lib/audio/encode.js'
import { audioFrames, mp3SampleRate, normalizeMp3 } from '../../lib/audio/mp3.js'
import { decodeMp3, edgeSilence, pausesIn, type Pause } from '../../lib/audio/pauses.js'
import { peaksOf } from '../../lib/audio/peaks.js'
import { buildCues, toSrt, toTranscript, toVtt, type SubtitlePart } from '../../lib/subtitles.js'
import { queue, QUEUES, startQueue, type ExportAudioJob } from '../../lib/queue.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { LANGS, type Lang } from '../ingestion/text/language.js'
import { planAtLeast } from '../plans/plan-catalog.js'
import { lexiconFor } from '../pronunciations/lexicon-cache.js'
import type { Lexicon } from '../pronunciations/lexicon.js'
import { planFor, type TtsService } from '../tts/tts.service.js'
import type { UsageService } from '../usage/usage.service.js'
import { isServerVoice, type ServerTier, type VoiceDefinition } from '../voices/voice-catalog.js'
import { mainLanguage, type VoicesService } from '../voices/voices.service.js'
import { finishLoudness } from '../../lib/audio/loudness.js'
import { exportLoudness, LOUDNESS, type LoudnessId } from '../studio/studio-catalog.js'
import type { ExportsRepository } from './exports.repository.js'

// Bump to rebuild every MP3 (e.g. after changing how clips are joined). 2: subtitles. 3: pauses, short captions, script text.
// 4: an even gap between parts
const EXPORT_VERSION = 5
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60
const VOICING_CONCURRENCY = 3

// In an MP3, from the end of one part's speech to the start of the next
const PART_GAP_MS = 600

// A job voices parts for this long, then hands over to a fresh job: a whole book never
// meets the queue's time limit, a restart loses one step at most, and other exports get
// a turn in between
const STEP_MS = 10 * 60_000
// A part the voice service fails on is tried this many times before the export stops
const PART_ATTEMPTS = 3
const PART_RETRY_MS = 5_000
// Errors that trying again won't fix
const FINAL_CODES = new Set(['USAGE_LIMIT_REACHED', 'BUDGET_PAUSED', 'PHONE_VOICE'])
// Part files fetched ahead of the one being joined
const READ_AHEAD = 6

const premiumRequired = () => new AppError('Downloading audio is part of Plus and Pro.', 403, 'PREMIUM_REQUIRED')

// Bump to make every offline download out of date (e.g. after changing what goes in one)
const OFFLINE_VERSION = 1
// Long enough for the app to fetch every clip after the manifest arrives
const OFFLINE_URL_TTL_SECONDS = 6 * 60 * 60

/** Files made with every MP3, next to it: subtitles in two sizes and two formats, and the script as text */
const EXTRAS = ['srt', 'vtt', 'short.srt', 'short.vtt', 'words.srt', 'txt'] as const
type Extra = (typeof EXTRAS)[number]
const subtitleKey = (mp3Key: string, ext: Extra) => mp3Key.replace(/\.mp3$/, `.${ext}`)

/** Silence in the MP3's own format (gaps, and pauses after parts), and how long it really plays */
const silences = new Map<string, { frames: Buffer; durationMs: number }>()
function silence(ms: number, sampleRate: number) {
  const rounded = Math.round(ms / 10) * 10
  const key = `${rounded}:${sampleRate}`
  let saved = silences.get(key)
  if (!saved) {
    const frames = audioFrames(pcmToMp3(Buffer.alloc(Math.round((rounded / 1000) * sampleRate) * 2), sampleRate))
    saved = { frames, durationMs: normalizeMp3(frames).durationMs }
    if (silences.size > 500) silences.clear()
    silences.set(key, saved)
  }
  return saved
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type ServerVoice = VoiceDefinition & { tier: ServerTier }

/** A part's finished audio file */
type PartFile = { id: string; blobHash: string | null; storageKey: string; durationMs: number; mimeType: string | null }

/** A newer job (a fresh export, or a resume) took over while this one was joining */
class TakenOver extends Error {}

// A running export or download touches its row as each part is voiced (and while joining).
// One silent for this long was stopped by a crash or restart (a deploy): it carries on in a
// new job, keeping every part already voiced, instead of waiting for its old job to expire.
const STALLED_MS = 5 * 60_000
// After this many restarts it's left stopped, in case something keeps killing it
const MAX_RESUMES = 5
const STOPPED_MESSAGE = 'This stopped part-way (the server restarted). Start it again: parts already voiced are kept and cost nothing.'
const stalled = (row: { status: string; updatedAt: Date } | null) => row?.status === 'RUNNING' && Date.now() - row.updatedAt.getTime() > STALLED_MS
// A resumed job keeps its first job's id, followed by how many times it has resumed: "<uuid>~2"
const resumesOf = (jobId: string | null) => Number(jobId?.split('~')[1] ?? 0)
const resumedJobId = (jobId: string | null, n: number) => `${jobId?.split('~')[0] || randomUUID()}~${n}`
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
  private async plan(userId: string, documentId: string, voiceId: string | undefined, chunks: DocumentChunk[], chosen: string | null | undefined, main: Lang | null, studio: unknown) {
    const [prefs, lexicon] = await Promise.all([this.voicesService.getPreferences(userId, documentId), lexiconFor(userId)])
    const pick = voiceId ?? chosen
    // Phone voices can't be voiced here; their languages use the default server voice
    const voices = Object.fromEntries(LANGS.map((lang) => [lang, this.voicesService.resolveServer(pick, lang, prefs, main)])) as Record<Lang, ServerVoice>
    const voiceFor = (c: DocumentChunk) => this.voicesService.forPartServer(c, voices[c.language as Lang], prefs)
    // Pauses after parts are part of the MP3 too
    const keys = chunks.map((c) => `${voiceFor(c).id}:${planFor(c, voiceFor(c), lexicon).key}:${c.pauseAfterMs}`)
    // A script for a platform is finished at that platform's loudness, so changing platform makes it again
    const finish = exportLoudness(studio)
    const renderKey = createHash('sha256').update(JSON.stringify([EXPORT_VERSION, documentId, keys, ...(finish ? [finish] : [])])).digest('hex').slice(0, 16)
    return { voiceFor, renderKey, pick, lexicon, finish }
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
            /** Two or three words at a time, the style TikTok and Reels captions use */
            wordsSrt: await link(subtitleKey(row.storageKey!, 'words.srt')),
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

  /**
   * Every MP3 the listener has made ("Your exports"), newest first. A finished one
   * comes with a link to play or save it (Plus and up, like the export itself);
   * whether it still matches the document is worked out when it's opened.
   */
  async list(userId: string) {
    const [rows, prefs, plan] = await Promise.all([
      this.exportsRepository.listForUser(userId),
      this.voicesService.getPreferences(userId),
      this.exportsRepository.findUserPlan(userId),
    ])
    const canDownload = planAtLeast(plan?.plan, 'plus')
    return Promise.all(
      rows.map(async (row) => ({
        documentId: row.document.id,
        title: row.document.title,
        isScript: row.document.isScript,
        status: row.status,
        chunksDone: row.chunksDone,
        chunkCount: row.chunkCount,
        durationMs: row.durationMs,
        sizeBytes: row.sizeBytes,
        error: row.error,
        voiceName: row.voiceId ? (this.voicesService.find(row.voiceId, this.voicesService.forDocument(prefs, row.document.id))?.name ?? null) : null,
        madeAt: row.updatedAt.toISOString(),
        url: canDownload && row.status === 'READY' && row.storageKey ? await storage.signedUrl(row.storageKey, DOWNLOAD_URL_TTL_SECONDS) : null,
      })),
    )
  }

  async status(userId: string, documentId: string, voiceId?: string) {
    const doc = await this.ownedReady(userId, documentId)
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { renderKey, voiceFor, lexicon } = await this.plan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId, mainLanguage(doc.language), doc.studio)
    const { summary } = await this.voicing(documentId, chunks.map((chunk) => ({ chunk, voice: voiceFor(chunk) })), lexicon)
    let row = doc.export
    if (row && stalled(row)) row = await this.resume(documentId, row)
    return this.view(row, renderKey, userId, summary)
  }

  async start(userId: string, documentId: string, voiceId?: string) {
    if (!planAtLeast((await this.exportsRepository.findUserPlan(userId))?.plan, 'plus')) throw premiumRequired()
    const doc = await this.ownedReady(userId, documentId)
    // Someone else's writing stays theirs: it can be heard (and downloaded to listen offline), not exported
    if (doc.publicationId) throw new AppError("A writer's work from Explore can't be saved as an MP3. You can still download it to listen offline.", 403, 'FROM_COMMUNITY')
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { voiceFor, renderKey, pick, lexicon } = await this.plan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId, mainLanguage(doc.language), doc.studio)
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
    await this.continueLater(QUEUES.exportAudio, { documentId, jobId, voiceId: pick ?? undefined })
    return this.view(row, renderKey, userId, summary)
  }

  /** Queues the next step of an export or download (or its first) */
  private async continueLater(name: typeof QUEUES.exportAudio | typeof QUEUES.prepareOffline, job: ExportAudioJob) {
    await startQueue()
    await queue.send(name, job)
  }

  /** Whether a job is in the queue, waiting for its turn or for a retry, rather than lost */
  private async queued(name: typeof QUEUES.exportAudio | typeof QUEUES.prepareOffline, jobId: string | null) {
    if (!jobId) return false
    await startQueue()
    return (await queue.findJobs(name, { data: { jobId }, queued: true })).length > 0
  }

  /** An export whose job died carries on in a new one; after MAX_RESUMES it's left stopped */
  private async resume(documentId: string, row: AudioExport) {
    // Other exports ahead of it in the queue: it isn't lost, just waiting
    if (await this.queued(QUEUES.exportAudio, row.jobId)) return row
    const resumes = resumesOf(row.jobId)
    if (resumes >= MAX_RESUMES) return (await this.exportsRepository.markStopped(documentId, row.jobId, STOPPED_MESSAGE)) ?? row
    const jobId = resumedJobId(row.jobId, resumes + 1)
    // Null when another request resumed it a moment ago
    const resumed = await this.exportsRepository.takeOver(documentId, row.jobId, jobId)
    if (!resumed) return row
    console.warn(`[exports] ${documentId} stalled; resuming (${resumes + 1} of ${MAX_RESUMES})`)
    await this.continueLater(QUEUES.exportAudio, { documentId, jobId, voiceId: row.voiceId ?? undefined })
    return resumed
  }

  /** Every part's finished audio file, by chunk, voice and render key */
  private async partFiles(documentId: string) {
    const files = new Map<string, PartFile>()
    for (const c of await this.exportsRepository.clipFiles(documentId)) {
      if (c.storageKey && c.durationMs != null) files.set(`${c.chunkId}:${c.voiceId}:${c.renderKey}`, { ...c, storageKey: c.storageKey, durationMs: c.durationMs })
    }
    return files
  }

  /**
   * Voices parts a few at a time until they're all done or `deadline` passes.
   * A part the voice service fails on is tried again first. When one fails for
   * good, the others finish the part they're on and stop, so nothing goes on
   * voicing after the job has ended. `onVoiced` is false once a newer job has
   * taken over. Returns how many parts are left, or null if taken over.
   */
  private async voiceParts(
    userId: string,
    items: { chunk: DocumentChunk; voice: VoiceDefinition }[],
    lexicon: Lexicon,
    deadline: number,
    onVoiced: () => Promise<boolean>,
  ) {
    let next = 0
    let stop = false
    let takenOver = false
    let failure: unknown = null
    const worker = async () => {
      while (!stop && next < items.length && Date.now() < deadline) {
        const { chunk, voice } = items[next++]
        try {
          await this.voicePart(userId, chunk, voice, lexicon)
          if (!(await onVoiced())) {
            takenOver = true
            stop = true
          }
        } catch (e) {
          failure ??= e
          stop = true
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(VOICING_CONCURRENCY, items.length) }, worker))
    if (failure) throw failure
    return takenOver ? null : items.length - next
  }

  /** One part's audio, trying again when the voice service fails or stalls */
  private async voicePart(userId: string, chunk: DocumentChunk, voice: VoiceDefinition, lexicon: Lexicon) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.ttsService.ensureClip(userId, chunk, voice, lexicon, { background: true })
      } catch (e) {
        if (attempt >= PART_ATTEMPTS || (e instanceof AppError && FINAL_CODES.has(e.code ?? ''))) throw e
        console.warn(`[exports] part ${chunk.index} of ${chunk.documentId} failed (try ${attempt} of ${PART_ATTEMPTS}): ${e instanceof Error ? e.message : e}`)
        await sleep(attempt * PART_RETRY_MS)
      }
    }
  }

  /**
   * Job body, a step at a time: voice what's missing for up to STEP_MS, then
   * hand over to a new job, or once every part has audio, stream the joined
   * MP3 into storage. A job that's no longer the export's latest stops.
   */
  async run(documentId: string, jobId: string, voiceId: string | undefined) {
    const doc = await this.exportsRepository.findDocument(documentId)
    if (!doc || doc.status !== 'READY' || doc.export?.jobId !== jobId) return
    const deadline = Date.now() + STEP_MS
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { voiceFor, renderKey, lexicon, finish } = await this.plan(doc.userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId, mainLanguage(doc.language), doc.studio)
    const keyOf = (chunk: DocumentChunk) => `${chunk.id}:${voiceFor(chunk).id}:${planFor(chunk, voiceFor(chunk), lexicon).key}`

    // Parts with current audio (voiced earlier, or in an earlier step) are skipped
    const files = await this.partFiles(documentId)
    const todo = chunks.filter((c) => !files.has(keyOf(c))).map((chunk) => ({ chunk, voice: voiceFor(chunk) }))
    let done = chunks.length - todo.length
    if (!(await this.exportsRepository.updateForJob(documentId, jobId, { chunksDone: done, chunkCount: chunks.length }))) return
    const left = await this.voiceParts(doc.userId, todo, lexicon, deadline, () =>
      this.exportsRepository.updateForJob(documentId, jobId, { chunksDone: ++done }),
    )
    if (left === null) return
    // Out of time: the next step carries on from here (and joins, if that's all that's left)
    if (left > 0 || Date.now() > deadline) return this.continueLater(QUEUES.exportAudio, { documentId, jobId, voiceId })

    try {
      await this.join(doc.userId, documentId, jobId, chunks, voiceFor, lexicon, renderKey, finish)
    } catch (e) {
      if (!(e instanceof TakenOver)) throw e
    }
  }

  /**
   * Streams every part into one MP3 in storage, with an even gap between
   * parts, then writes the subtitles and the script next to it.
   */
  private async join(
    userId: string,
    documentId: string,
    jobId: string,
    chunks: DocumentChunk[],
    voiceFor: (c: DocumentChunk) => ServerVoice,
    lexicon: Lexicon,
    renderKey: string,
    finish: LoudnessId | null,
  ) {
    const files = await this.partFiles(documentId)
    const clips: PartFile[] = []
    for (const chunk of chunks) {
      const voice = voiceFor(chunk)
      // Edited since this step started: voiced now
      clips.push(files.get(`${chunk.id}:${voice.id}:${planFor(chunk, voice, lexicon).key}`) ?? (await this.voicePart(userId, chunk, voice, lexicon)))
    }
    if (clips.some((c) => c.mimeType !== 'audio/mpeg')) {
      throw new AppError('MP3 export needs the real speech provider (the dev mock voice makes WAV)', 500, 'EXPORT_UNSUPPORTED')
    }

    // A part's file, made again (at our cost) if it has gone missing from storage
    const read = async (i: number) => {
      try {
        return await storage.get(clips[i].storageKey)
      } catch (e) {
        if (await storage.exists(clips[i].storageKey)) throw e
        console.warn(`[exports] audio for part ${i} of ${documentId} is missing; making it again`)
        await this.ttsService.forgetMissing(clips[i])
        clips[i] = await this.ttsService.ensureClip(userId, chunks[i], voiceFor(chunks[i]), lexicon, { background: true, free: true })
        return storage.get(clips[i].storageKey)
      }
    }
    const ahead = new Map<number, Promise<Buffer>>()
    const readFrom = (i: number) => {
      for (let j = i; j < Math.min(i + READ_AHEAD, clips.length); j++) {
        if (ahead.has(j)) continue
        const file = read(j)
        file.catch(() => {}) // awaited in turn below; failing early isn't an unhandled rejection
        ahead.set(j, file)
      }
    }

    const storageKey = `exports/${documentId}/${renderKey}.mp3`
    // Silences found before are kept with the shared audio, so a re-export only listens to new parts
    const known = await this.exportsRepository.blobPauses(clips.flatMap((c) => (c.blobHash ? [c.blobHash] : [])))
    const pauses: Pause[][] = []
    // Where each part starts in the MP3, for the subtitles
    const starts: number[] = []
    let sizeBytes = 0
    let durationMs = 0
    const exportsRepository = this.exportsRepository
    let rate: number | null = null
    async function* parts() {
      let tailMs = 0
      for (let i = 0; i < clips.length; i++) {
        if (i % JOIN_HEARTBEAT_PARTS === 0 && !(await exportsRepository.updateForJob(documentId, jobId, { chunksDone: chunks.length }))) throw new TakenOver()
        readFrom(i)
        const file = await ahead.get(i)!
        ahead.delete(i)
        const clip = clips[i]
        const saved = clip.blobHash ? known.get(clip.blobHash) : undefined
        if (saved) pauses[i] = saved
        else {
          // Older audio: measure it now, and keep its waveform for Studio too
          const decoded = await decodeMp3(file).catch(() => null)
          pauses[i] = decoded ? pausesIn(decoded) : []
          if (decoded && clip.blobHash) await exportsRepository.saveAnalysis(clip.blobHash, pauses[i], peaksOf(decoded)).catch(() => {})
        }
        // Before this part: the creator's pause after the last one, and an even gap from its speech to this one's
        const edges = edgeSilence(pauses[i], clip.durationMs)
        const gapMs = i ? chunks[i - 1].pauseAfterMs + Math.max(PART_GAP_MS - tailMs - edges.leadMs, 0) : 0
        rate ??= mp3SampleRate(file)
        if (gapMs > 0 && rate) {
          const quiet = silence(gapMs, rate)
          sizeBytes += quiet.frames.length
          durationMs += quiet.durationMs
          yield quiet.frames
        }
        const frames = audioFrames(file)
        starts[i] = durationMs
        sizeBytes += frames.length
        durationMs += clip.durationMs
        yield frames
        tailMs = edges.tailMs
      }
      // The creator's pause after the last part
      const last = chunks.at(-1)?.pauseAfterMs ?? 0
      if (last > 0 && rate) {
        const quiet = silence(last, rate)
        sizeBytes += quiet.frames.length
        durationMs += quiet.durationMs
        yield quiet.frames
      }
    }
    await storage.putStream(storageKey, Readable.from(parts()), 'audio/mpeg')

    // For a platform: finished at its loudness (the timing stays the same, so the subtitles below still fit)
    if (finish) {
      const finished = await finishLoudness(await storage.get(storageKey), LOUDNESS[finish], rate ?? 24_000)
      if (finished) {
        await storage.put(storageKey, finished.audio, 'audio/mpeg')
        sizeBytes = finished.audio.length
        console.log(`[exports] ${documentId} finished for ${finish}: ${finished.lufs} LUFS, true peak ${finished.peakDb} dB`)
      }
    }

    // Subtitles show the script as written, timed to the joined recording
    const subtitleParts: SubtitlePart[] = chunks.map((chunk, i) => ({
      text: chunk.text,
      sentences: chunk.sentences as unknown as SubtitlePart['sentences'],
      offsetMs: starts[i],
      durationMs: clips[i].durationMs,
      pauses: pauses[i] ?? [],
      cjk: chunk.language === 'ja' || chunk.language === 'zh',
    }))
    const cues = buildCues(subtitleParts)
    const short = buildCues(subtitleParts, 'short')
    const words = buildCues(subtitleParts, 'words')
    const extras: Record<Extra, [string, string]> = {
      srt: [toSrt(cues), 'application/x-subrip'],
      vtt: [toVtt(cues), 'text/vtt'],
      'short.srt': [toSrt(short), 'application/x-subrip'],
      'short.vtt': [toVtt(short), 'text/vtt'],
      'words.srt': [toSrt(words), 'application/x-subrip'],
      txt: [toTranscript(chunks), 'text/plain; charset=utf-8'],
    }
    await Promise.all(EXTRAS.map((ext) => storage.put(subtitleKey(storageKey, ext), Buffer.from(extras[ext][0], 'utf8'), extras[ext][1])))

    const before = (await this.exportsRepository.findDocument(documentId))?.export?.storageKey ?? null
    const latest = await this.exportsRepository.updateForJob(documentId, jobId, {
      status: 'READY',
      // What was actually built, in case the document changed after the export was requested
      renderKey,
      storageKey,
      sizeBytes,
      durationMs: Math.round(durationMs),
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
  private async remakeMissing(userId: string, chunks: DocumentChunk[], clips: PartFile[], voiceFor: (c: DocumentChunk) => VoiceDefinition, lexicon: Lexicon) {
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
  private async offlinePlan(userId: string, documentId: string, voiceId: string | undefined, chunks: DocumentChunk[], chosen: string | null | undefined, main: Lang | null) {
    const [prefs, lexicon] = await Promise.all([this.voicesService.getPreferences(userId, documentId), lexiconFor(userId)])
    const pick = voiceId ?? chosen
    const voices = Object.fromEntries(LANGS.map((lang) => [lang, this.voicesService.resolve(pick, lang, prefs, main)])) as Record<Lang, VoiceDefinition>
    const voiced = chunks.flatMap((chunk) => {
      const voice = this.voicesService.forPart(chunk, voices[chunk.language as Lang], prefs)
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
    const { renderKey } = await this.offlinePlan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId, mainLanguage(doc.language))
    let row = doc.offline
    if (row && stalled(row)) row = await this.resumeOffline(documentId, row)
    return this.offlineView(row, renderKey)
  }

  /** A download whose job died carries on in a new one; after MAX_RESUMES it's left stopped */
  private async resumeOffline(documentId: string, row: OfflineDownload) {
    if (await this.queued(QUEUES.prepareOffline, row.jobId)) return row
    const resumes = resumesOf(row.jobId)
    if (resumes >= MAX_RESUMES) return (await this.exportsRepository.markOfflineStopped(documentId, row.jobId, STOPPED_MESSAGE)) ?? row
    const jobId = resumedJobId(row.jobId, resumes + 1)
    const resumed = await this.exportsRepository.takeOverOffline(documentId, row.jobId, jobId)
    if (!resumed) return row
    console.warn(`[offline] ${documentId} stalled; resuming (${resumes + 1} of ${MAX_RESUMES})`)
    await this.continueLater(QUEUES.prepareOffline, { documentId, jobId, voiceId: row.voiceId ?? undefined })
    return resumed
  }

  /** Voices whatever is missing in the background; the app downloads the clips once it's READY */
  async startOffline(userId: string, documentId: string, voiceId?: string) {
    await this.assertPlus(userId)
    const doc = await this.ownedReady(userId, documentId)
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { voiced, renderKey, pick } = await this.offlinePlan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId, mainLanguage(doc.language))

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
    await this.continueLater(QUEUES.prepareOffline, { documentId, jobId, voiceId: pick ?? undefined })
    return this.offlineView(row, renderKey)
  }

  /** Job body, a step at a time like an export's: voice every chunk the download needs */
  async runOffline(documentId: string, jobId: string, voiceId: string | undefined) {
    const doc = await this.exportsRepository.findDocument(documentId)
    if (!doc || doc.status !== 'READY' || doc.offline?.jobId !== jobId) return
    const deadline = Date.now() + STEP_MS
    const chunks = await this.exportsRepository.listChunks(documentId)
    const { voiced, renderKey, lexicon } = await this.offlinePlan(doc.userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId, mainLanguage(doc.language))

    const files = await this.partFiles(documentId)
    const todo = voiced.filter((v) => !files.has(`${v.chunk.id}:${v.voice.id}:${v.key}`))
    let done = voiced.length - todo.length
    if (!(await this.exportsRepository.updateOfflineForJob(documentId, jobId, { chunksDone: done, chunkCount: voiced.length }))) return
    const left = await this.voiceParts(doc.userId, todo, lexicon, deadline, () =>
      this.exportsRepository.updateOfflineForJob(documentId, jobId, { chunksDone: ++done }),
    )
    if (left === null) return
    if (left > 0 || Date.now() > deadline) return this.continueLater(QUEUES.prepareOffline, { documentId, jobId, voiceId })

    // Every file really in storage, so the app's download doesn't fail on a missing one
    const ready = await this.partFiles(documentId)
    const clips: PartFile[] = []
    for (const { chunk, voice, key } of voiced) clips.push(ready.get(`${chunk.id}:${voice.id}:${key}`) ?? (await this.voicePart(doc.userId, chunk, voice, lexicon)))
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
    const { voiced, renderKey, voices } = await this.offlinePlan(userId, documentId, voiceId, chunks, doc.playback[0]?.voiceId, mainLanguage(doc.language))
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
