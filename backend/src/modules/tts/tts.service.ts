import { parseBuffer } from 'music-metadata'
import { CHARS_PER_SECOND } from '../../config/constants.js'
import type { AudioClip, DocumentChunk } from '../../generated/prisma/client.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { readExpressions } from '../expressions/expression-catalog.js'
import type { UsageService } from '../usage/usage.service.js'
import type { VoiceDefinition } from '../voices/voice-catalog.js'
import type { TtsProvider } from './providers/tts-provider.js'
import { planRender, type RenderPlan } from './render-plan.js'
import type { TtsRepository } from './tts.repository.js'

// A GENERATING row older than this was left by a crashed request
const STALE_GENERATING_MS = 2 * 60_000
const POLL_MS = 400

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type ReadyClip = AudioClip & { storageKey: string; durationMs: number }

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
  planRender(chunk.text, readExpressions(chunk.expressions), voice)

/**
 * Generates and caches speech per (chunk, voice). A clip is reused while its
 * render key matches, so editing a chunk's emotions regenerates just that
 * chunk. Concurrent requests for the same clip share one generation, in this
 * process via a promise map and across processes via the unique (chunkId, voiceId) row.
 */
export class TtsService {
  private readonly inflight = new Map<string, Promise<ReadyClip>>()

  constructor(
    private readonly ttsRepository: TtsRepository,
    private readonly usageService: UsageService,
    private readonly provider: TtsProvider,
  ) {}

  ensureClip(userId: string, chunk: DocumentChunk, voice: VoiceDefinition): Promise<ReadyClip> {
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

  private async generate(userId: string, chunk: DocumentChunk, voice: VoiceDefinition, plan: RenderPlan, attempt = 0): Promise<ReadyClip> {
    let existing = await this.ttsRepository.find(chunk.id, voice.id)
    if (existing?.status === 'GENERATING' && existing.provider === this.provider.name && Date.now() - existing.updatedAt.getTime() < STALE_GENERATING_MS) {
      // Another request is voicing it (possibly before an edit); reuse it if it's current
      existing = await this.waitForOther(chunk.id, voice.id)
    }
    if (this.isCurrent(existing, plan)) return existing as ReadyClip
    if (existing) {
      await this.ttsRepository.delete(existing.id)
      if (existing.storageKey) await storage.delete(existing.storageKey).catch(() => {})
    }

    if (this.provider.billable) await this.usageService.assertAvailable(userId, chunk.text.length)

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
      const other = await this.waitForOther(chunk.id, voice.id)
      return this.isCurrent(other, plan) || attempt >= 2 ? (other as ReadyClip) : this.generate(userId, chunk, voice, plan, attempt + 1)
    }

    try {
      const result = await this.provider.synthesize({ text: plan.input, voice, style: plan.style })
      const fallbackSec = chunk.text.length / CHARS_PER_SECOND[voice.language]
      const durationMs = result.durationMs ?? (await measureMs(result.audio, result.mimeType, fallbackSec))
      const storageKey = `audio/${chunk.documentId}/${voice.id}/${chunk.index}-${plan.key.slice(0, 8)}.${result.extension}`
      await storage.put(storageKey, result.audio, result.mimeType)

      const ready = await this.ttsRepository.update(row.id, {
        status: 'READY',
        storageKey,
        mimeType: result.mimeType,
        durationMs,
        provider: result.provider,
        model: result.model,
      })
      if (this.provider.billable) await this.usageService.record(userId, chunk.text.length)
      return ready as ReadyClip
    } catch (e) {
      await this.ttsRepository.update(row.id, { status: 'FAILED', error: e instanceof Error ? e.message.slice(0, 500) : 'Unknown error' })
      throw e
    }
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
    const prefix = `previews/${this.provider.name}/${voice.id}-${`${voice.providerVoice}-${voice.model}`.replace(/[^a-z0-9]+/gi, '_')}`
    for (const ext of ['mp3', 'wav']) {
      if (await storage.exists(`${prefix}.${ext}`)) return `${prefix}.${ext}`
    }
    const result = await this.provider.synthesize({ text, voice, style: voice.accentStyle })
    const key = `${prefix}.${result.extension}`
    await storage.put(key, result.audio, result.mimeType)
    return key
  }
}
