import { createHash } from 'node:crypto'
import { parseBuffer } from 'music-metadata'
import { CHARS_PER_SECOND } from '../../config/constants.js'
import type { AudioClip, DocumentChunk } from '../../generated/prisma/client.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { audioFrames } from '../../lib/audio/mp3.js'
import { readExpressions, type ChunkExpressions } from '../expressions/expression-catalog.js'
import type { UsageService } from '../usage/usage.service.js'
import { isServerVoice, type ServerTier, type VoiceDefinition } from '../voices/voice-catalog.js'
import type { TtsProvider } from './providers/tts-provider.js'
import { planRender, type RenderPlan } from './render-plan.js'
import type { TtsRepository } from './tts.repository.js'

// A GENERATING row older than this was left by a crashed request
const STALE_GENERATING_MS = 2 * 60_000
const POLL_MS = 400
// Bump when stored audio changes format or bitrate, so new clips aren't served old files
const ENCODING_VERSION = 2
// Shared files nobody plays are kept this long before the daily cleanup removes them
const ORPHAN_GRACE_MS = 24 * 60 * 60_000

const phoneVoiceError = () => new AppError('Phone voices play on the device, not from the server.', 400, 'PHONE_VOICE')

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002'
const isForeignKeyViolation = (e: unknown) => (e as { code?: string })?.code === 'P2003'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type ReadyClip = AudioClip & { storageKey: string; durationMs: number }
type ServerVoice = VoiceDefinition & { tier: ServerTier }

async function measureMs(audio: Buffer, mimeType: string, fallbackSec: number) {
  try {
    const { format } = await parseBuffer(new Uint8Array(audio), mimeType, { duration: true })
    if (format.duration) return Math.round(format.duration * 1000)
  } catch {
    // fall through to the estimate
  }
  return Math.round(fallbackSec * 1000)
}

/** What a chunk will sound like in a voice, including the listener's emotions */
export const planFor = (chunk: DocumentChunk, voice: VoiceDefinition) =>
  planRender(chunk.text, readExpressions(chunk.expressions), voice, chunk.narration)

/** Identifies the exact speech a request produces, across every user's documents */
const blobHash = (provider: string, voice: VoiceDefinition, plan: RenderPlan) =>
  createHash('sha256')
    .update(JSON.stringify([ENCODING_VERSION, provider, voice.model, voice.providerVoice, plan.input, plan.style ?? null]))
    .digest('hex')

/**
 * Generates and caches speech per (chunk, voice). A clip is reused while its
 * render key matches, so editing a chunk's emotions regenerates just that
 * chunk. Concurrent requests for the same clip share one generation, in this
 * process via a promise map and across processes via the unique (chunkId, voiceId) row.
 *
 * The audio file itself is shared: identical speech (same text, voice and
 * emotions) is generated once for everyone, so the same article imported by
 * many listeners costs nothing after the first. Reused audio doesn't count
 * against anyone's allowance.
 */
export class TtsService {
  private readonly inflight = new Map<string, Promise<ReadyClip>>()

  constructor(
    private readonly ttsRepository: TtsRepository,
    private readonly usageService: UsageService,
    private readonly provider: TtsProvider,
  ) {}

  ensureClip(userId: string, chunk: DocumentChunk, voice: VoiceDefinition): Promise<ReadyClip> {
    if (!isServerVoice(voice)) return Promise.reject(phoneVoiceError())
    const plan = planFor(chunk, voice)
    const key = `${chunk.id}:${voice.id}:${plan.key}`
    let pending = this.inflight.get(key)
    if (!pending) {
      pending = this.generate(userId, chunk, voice, plan).finally(() => this.inflight.delete(key))
      this.inflight.set(key, pending)
    }
    return pending
  }

  private isCurrent(clip: AudioClip | null, plan: RenderPlan) {
    return clip?.status === 'READY' && clip.provider === this.provider.name && clip.renderKey === plan.key
  }

  private async generate(userId: string, chunk: DocumentChunk, voice: ServerVoice, plan: RenderPlan, attempt = 0): Promise<ReadyClip> {
    let existing = await this.ttsRepository.find(chunk.id, voice.id)
    if (existing?.status === 'GENERATING' && existing.provider === this.provider.name && Date.now() - existing.updatedAt.getTime() < STALE_GENERATING_MS) {
      // Another request is voicing it (possibly before an edit); reuse it if it's current
      existing = await this.waitForOther(chunk.id, voice.id)
    }
    if (this.isCurrent(existing, plan)) return existing as ReadyClip
    if (existing) await this.discard(existing)

    const hash = blobHash(this.provider.name, voice, plan)
    const shared = await this.ttsRepository.findBlob(hash)
    if (shared) {
      try {
        const clip = await this.ttsRepository.create({
          chunkId: chunk.id,
          voiceId: voice.id,
          status: 'READY',
          provider: this.provider.name,
          model: shared.model,
          renderKey: plan.key,
          charCount: chunk.text.length,
          blobHash: hash,
          storageKey: shared.storageKey,
          mimeType: shared.mimeType,
          durationMs: shared.durationMs,
        })
        return clip as ReadyClip
      } catch (e) {
        if (isUniqueViolation(e)) return this.afterRace(userId, chunk, voice, plan, attempt)
        // The shared file was cleaned up a moment ago; make it again below
        if (!isForeignKeyViolation(e)) throw e
      }
    }

    const estimatedSec = chunk.text.length / CHARS_PER_SECOND[voice.language]
    if (this.provider.billable) await this.usageService.assertAvailable(userId, voice, estimatedSec, chunk.text.length)

    let row: AudioClip
    try {
      row = await this.ttsRepository.create({
        chunkId: chunk.id,
        voiceId: voice.id,
        provider: this.provider.name,
        model: voice.model,
        renderKey: plan.key,
        charCount: chunk.text.length,
      })
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
      return this.afterRace(userId, chunk, voice, plan, attempt)
    }

    try {
      const result = await this.provider.synthesize({ text: plan.input, voice, style: plan.style })
      const durationMs = result.durationMs ?? (await measureMs(result.audio, result.mimeType, estimatedSec))
      const storageKey = `audio/blobs/${hash.slice(0, 2)}/${hash}.${result.extension}`
      await storage.put(storageKey, result.audio, result.mimeType)
      await this.ttsRepository.saveBlob({ hash, storageKey, mimeType: result.mimeType, durationMs, model: result.model, sizeBytes: result.audio.length })

      const ready = await this.ttsRepository.update(row.id, {
        status: 'READY',
        storageKey,
        mimeType: result.mimeType,
        durationMs,
        provider: result.provider,
        model: result.model,
        blobHash: hash,
      })
      if (this.provider.billable) await this.usageService.record(userId, voice, durationMs / 1000, chunk.text.length)
      return ready as ReadyClip
    } catch (e) {
      await this.ttsRepository.update(row.id, { status: 'FAILED', error: e instanceof Error ? e.message.slice(0, 500) : 'Unknown error' })
      throw e
    }
  }

  /** Another request created this clip's row first: use its result, or retry if it's stale */
  private async afterRace(userId: string, chunk: DocumentChunk, voice: ServerVoice, plan: RenderPlan, attempt: number) {
    const other = await this.waitForOther(chunk.id, voice.id)
    return this.isCurrent(other, plan) || attempt >= 2 ? (other as ReadyClip) : this.generate(userId, chunk, voice, plan, attempt + 1)
  }

  /** Drops an outdated clip. Shared files stay for other clips; older per-document files go now. */
  private async discard(clip: AudioClip) {
    await this.ttsRepository.delete(clip.id)
    if (clip.storageKey && !clip.blobHash) await storage.delete(clip.storageKey).catch(() => {})
  }

  /**
   * Voices a piece of text that isn't a whole chunk (voice notes). It's shared
   * and cached like clips, but kept only until the daily cleanup. Pass no user
   * for app-made audio (the "Made with ListenUp" ending), which costs no one's minutes.
   */
  async voiceText(userId: string | null, text: string, expressions: ChunkExpressions, voice: VoiceDefinition, narration?: string | null) {
    if (!isServerVoice(voice)) throw phoneVoiceError()
    const plan = planRender(text, expressions, voice, narration)
    const hash = blobHash(this.provider.name, voice, plan)
    const shared = await this.ttsRepository.findBlob(hash)
    if (shared) return shared

    const estimatedSec = text.length / CHARS_PER_SECOND[voice.language]
    if (this.provider.billable && userId) await this.usageService.assertAvailable(userId, voice, estimatedSec, text.length)
    const result = await this.provider.synthesize({ text: plan.input, voice, style: plan.style })
    const durationMs = result.durationMs ?? (await measureMs(result.audio, result.mimeType, estimatedSec))
    const storageKey = `audio/blobs/${hash.slice(0, 2)}/${hash}.${result.extension}`
    await storage.put(storageKey, result.audio, result.mimeType)
    const blob = await this.ttsRepository.saveBlob({ hash, storageKey, mimeType: result.mimeType, durationMs, model: result.model, sizeBytes: result.audio.length })
    if (this.provider.billable && userId) await this.usageService.record(userId, voice, durationMs / 1000, text.length)
    return blob
  }

  /** One MP3 made of several (same voice and format), cached like any shared audio */
  async joinMp3(parts: { hash: string; storageKey: string; durationMs: number }[]) {
    const hash = createHash('sha256').update(JSON.stringify(['join', ...parts.map((p) => p.hash)])).digest('hex')
    const existing = await this.ttsRepository.findBlob(hash)
    if (existing) return existing
    const audio = Buffer.concat(await Promise.all(parts.map(async (p) => audioFrames(await storage.get(p.storageKey)))))
    const storageKey = `audio/blobs/${hash.slice(0, 2)}/${hash}.mp3`
    await storage.put(storageKey, audio, 'audio/mpeg')
    const durationMs = parts.reduce((ms, p) => ms + p.durationMs, 0)
    return this.ttsRepository.saveBlob({ hash, storageKey, mimeType: 'audio/mpeg', durationMs, model: 'joined', sizeBytes: audio.length })
  }

  /** Another request/process is generating this clip; wait for it */
  private async waitForOther(chunkId: string, voiceId: string): Promise<AudioClip> {
    const deadline = Date.now() + STALE_GENERATING_MS
    while (Date.now() < deadline) {
      await sleep(POLL_MS)
      const clip = await this.ttsRepository.find(chunkId, voiceId)
      if (clip?.status === 'READY') return clip
      if (!clip || clip.status === 'FAILED') break
    }
    throw new AppError("Couldn't prepare the audio. Try again.", 503, 'AUDIO_UNAVAILABLE')
  }

  /** Short sample of a voice, cached once for everyone */
  async preview(voice: VoiceDefinition, text: string) {
    if (!isServerVoice(voice)) throw phoneVoiceError()
    const prefix = `previews/${this.provider.name}/${voice.id}-${`${voice.providerVoice}-${voice.model}`.replace(/[^a-z0-9]+/gi, '_')}`
    for (const ext of ['mp3', 'wav']) {
      if (await storage.exists(`${prefix}.${ext}`)) return `${prefix}.${ext}`
    }
    const result = await this.provider.synthesize({ text, voice, style: voice.accentStyle })
    const key = `${prefix}.${result.extension}`
    await storage.put(key, result.audio, result.mimeType)
    return key
  }

  /** Daily cleanup: removes shared audio files that no clip has played for a day */
  async purgeOrphanBlobs() {
    const before = new Date(Date.now() - ORPHAN_GRACE_MS)
    let removed = 0
    for (;;) {
      const batch = await this.ttsRepository.orphanBlobs(before, 200)
      for (const blob of batch) {
        // Only if still unused at this moment; a clip may have picked it up since the query
        const { count } = await this.ttsRepository.deleteBlob(blob.hash)
        if (!count) continue
        await storage.delete(blob.storageKey).catch(() => {})
        removed++
      }
      if (batch.length < 200) return removed
    }
  }
}
