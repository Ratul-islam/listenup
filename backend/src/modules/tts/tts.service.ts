import { createHash } from 'node:crypto'
import { parseBuffer } from 'music-metadata'
import { CHARS_PER_SECOND } from '../../config/constants.js'
import type { AudioClip, DocumentChunk } from '../../generated/prisma/client.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { audioFrames } from '../../lib/audio/mp3.js'
import { readExpressions, sliceExpressions, type ChunkExpressions } from '../expressions/expression-catalog.js'
import { buildLexicon, EMPTY_LEXICON, type Lexicon, type PronunciationRule } from '../pronunciations/lexicon.js'
import type { UsageService } from '../usage/usage.service.js'
import { isServerVoice, type ServerTier, type VoiceDefinition } from '../voices/voice-catalog.js'
import type { TtsProvider } from './providers/tts-provider.js'
import { decodeMp3, pausesIn } from '../../lib/audio/pauses.js'
import { peaksOf } from '../../lib/audio/peaks.js'
import { spliceSentences } from '../../lib/audio/splice.js'
import type { SpeechRoute } from './providers/tts-provider.js'
import { planRender, readSentenceTakes, type RenderPlan } from './render-plan.js'
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

/** A sentence recorded again on its own ("Redo this sentence") */
export interface SentencePlan {
  index: number
  take: number
  plan: RenderPlan
}

/** A whole part's speech, plus any sentences redone on their own and spliced in */
export interface PartPlan extends RenderPlan {
  /** The whole-part recording underneath the redone sentences */
  base: RenderPlan
  sentences: SentencePlan[]
}

/** What a locked part keeps: the pronunciations it was locked with, and the voice the lock pinned (if any) */
export interface PartLock {
  rules: PronunciationRule[]
  pinnedVoice?: string
}

export const readLock = (value: unknown): PartLock | null =>
  value && typeof value === 'object' && Array.isArray((value as PartLock).rules) ? (value as PartLock) : null

// Locked parts keep the pronunciations they were locked with
const lockedLexicons = new Map<string, Lexicon>()
function lexiconOf(chunk: DocumentChunk, lexicon: Lexicon) {
  const lock = chunk.locked ? readLock(chunk.lockedLexicon) : null
  if (!lock) return lexicon
  const key = JSON.stringify(lock.rules)
  let saved = lockedLexicons.get(key)
  if (!saved) {
    if (lockedLexicons.size > 500) lockedLexicons.clear()
    saved = buildLexicon(lock.rules)
    lockedLexicons.set(key, saved)
  }
  return saved
}

/**
 * What a part will sound like in a voice: its text, emotions, pronunciations
 * and take, plus any sentences redone on their own. Without redone sentences
 * the key is the plain whole-part key, so cached audio stays valid.
 */
export function planFor(chunk: DocumentChunk, voice: VoiceDefinition, lexicon: Lexicon): PartPlan {
  const words = lexiconOf(chunk, lexicon)
  const marks = readExpressions(chunk.expressions)
  const base = planRender(chunk.text, marks, voice, chunk.narration, { lexicon: words, take: chunk.take })
  const spans = (chunk.sentences as unknown as { start: number; end: number }[]) ?? []
  const sentences = Object.entries(readSentenceTakes(chunk.sentenceTakes))
    .map(([i, take]) => ({ index: Number(i), take }))
    .filter(({ index }) => spans[index] && chunk.text.slice(spans[index].start, spans[index].end).trim())
    .sort((a, b) => a.index - b.index)
    .map(({ index, take }) => {
      const { start, end } = spans[index]
      // The part's own take is part of it, so a sentence redone after a new take of the part is recorded afresh
      const sentenceTake = chunk.take * 1000 + take
      return { index, take, plan: planRender(chunk.text.slice(start, end), sliceExpressions(marks, start, end), voice, chunk.narration, { lexicon: words, take: sentenceTake }) }
    })
  if (!sentences.length) return { ...base, base, sentences }
  const key = createHash('sha256')
    .update(JSON.stringify([base.key, sentences.map((s) => [s.index, s.plan.key])]))
    .digest('hex')
    .slice(0, 16)
  return { ...base, key, base, sentences }
}

/** A part with redone sentences spliced in: its plan key covers the whole recording and every sentence take */
const spliceHash = (provider: string, voice: VoiceDefinition, plan: PartPlan) =>
  createHash('sha256').update(JSON.stringify(['splice', ENCODING_VERSION, provider, voice.model, voice.providerVoice, plan.key])).digest('hex')

/**
 * Identifies the exact speech a request produces, across every user's
 * documents. A new take is its own recording, never shared with take 0.
 */
const blobHash = (provider: string, voice: VoiceDefinition, plan: RenderPlan) =>
  createHash('sha256')
    .update(JSON.stringify([ENCODING_VERSION, provider, voice.model, voice.providerVoice, plan.input, plan.style ?? null, ...(plan.take ? [plan.take] : [])]))
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

  /**
   * `lexicon` is the document owner's pronunciations (see lexiconFor).
   * `background`: nobody is waiting (exports, downloads), so the half-price tier may be used.
   * `free`: remaking audio we lost (its file went missing), which the listener isn't charged for.
   */
  ensureClip(userId: string, chunk: DocumentChunk, voice: VoiceDefinition, lexicon: Lexicon, { background = false, free = false } = {}): Promise<ReadyClip> {
    if (!isServerVoice(voice)) return Promise.reject(phoneVoiceError())
    const plan = planFor(chunk, voice, lexicon)
    const key = `${chunk.id}:${voice.id}:${plan.key}`
    let pending = this.inflight.get(key)
    if (!pending) {
      pending = this.generate(free ? null : userId, chunk, voice, plan, background).finally(() => this.inflight.delete(key))
      this.inflight.set(key, pending)
    }
    return pending
  }

  private isCurrent(clip: AudioClip | null, plan: RenderPlan) {
    return clip?.status === 'READY' && clip.provider === this.provider.name && clip.renderKey === plan.key
  }

  /**
   * The audio a part already has, when it's the same whole-part recording this
   * plan builds on (only redone sentences differ): new sentences are spliced
   * into it, so the rest of the part isn't voiced or paid for again.
   */
  private async reusableBase(clip: AudioClip | null, plan: PartPlan) {
    if (!plan.sentences.length || clip?.status !== 'READY' || clip.provider !== this.provider.name || !clip.storageKey) return null
    if ((clip.baseKey ?? clip.renderKey) !== plan.base.key || clip.mimeType !== 'audio/mpeg') return null
    try {
      return { mp3: await storage.get(clip.storageKey), takes: readSentenceTakes(clip.sentenceTakes) }
    } catch {
      return null
    }
  }

  /**
   * Measures a new MP3 once, in the background: its silences (subtitles,
   * sentence redos) and its waveform (Studio). Nobody waits for it.
   */
  private analyse(hash: string, audio: Buffer, mimeType: string) {
    if (mimeType !== 'audio/mpeg') return
    void decodeMp3(audio)
      .then((decoded) => this.ttsRepository.saveAnalysis(hash, { pauses: pausesIn(decoded), peaks: peaksOf(decoded) }))
      .catch((e) => console.warn(`[tts] couldn't measure ${hash.slice(0, 8)}`, e))
  }

  /** New audio counts against the listener's minutes and towards the document's total */
  private async charge(userId: string | null, documentId: string | null, voice: ServerVoice, durationMs: number, characters: number, route?: SpeechRoute) {
    if (!this.provider.billable || !userId) return
    await this.usageService.record(userId, voice, durationMs / 1000, characters, route)
    if (documentId) await this.ttsRepository.addDocumentSeconds(documentId, Math.round(durationMs / 1000)).catch(() => {})
  }

  /** One recording (a whole part or one sentence), shared with everyone and made only if nobody has it yet */
  private async voicePiece(userId: string | null, documentId: string | null, voice: ServerVoice, plan: RenderPlan, characters: number, background: boolean) {
    const hash = blobHash(this.provider.name, voice, plan)
    const shared = await this.ttsRepository.findBlob(hash)
    if (shared) return shared
    const estimatedSec = characters / CHARS_PER_SECOND[voice.language]
    const result = await this.provider.synthesize({ text: plan.input, voice, style: plan.style, background })
    const durationMs = result.durationMs ?? (await measureMs(result.audio, result.mimeType, estimatedSec))
    const storageKey = `audio/blobs/${hash.slice(0, 2)}/${hash}.${result.extension}`
    await storage.put(storageKey, result.audio, result.mimeType)
    const blob = await this.ttsRepository.saveBlob({ hash, storageKey, mimeType: result.mimeType, durationMs, model: result.model, sizeBytes: result.audio.length })
    this.analyse(hash, result.audio, result.mimeType)
    await this.charge(userId, documentId, voice, durationMs, characters, result.route)
    return blob
  }

  /**
   * A part with redone sentences: its existing recording (or a new whole-part
   * one if there's none), with each redone sentence recorded alone and spliced
   * in. Only what's newly recorded is charged.
   */
  private async splice(userId: string | null, chunk: DocumentChunk, voice: ServerVoice, plan: PartPlan, start: Awaited<ReturnType<TtsService['reusableBase']>>, background: boolean) {
    const base = start ?? { mp3: await storage.get((await this.voicePiece(userId, chunk.documentId, voice, plan.base, chunk.text.length, background)).storageKey), takes: {} as Record<number, number> }
    const due = plan.sentences.filter((s) => base.takes[s.index] !== s.take)
    const spans = chunk.sentences as unknown as { start: number; end: number }[]
    const replacements = []
    for (const s of due) {
      const piece = await this.voicePiece(userId, chunk.documentId, voice, s.plan, spans[s.index].end - spans[s.index].start, background)
      replacements.push({ index: s.index, mp3: await storage.get(piece.storageKey) })
    }
    return spliceSentences(base.mp3, { text: chunk.text, sentences: spans }, replacements)
  }

  /** `userId` is who pays; null for audio that's remade at our cost */
  private async generate(userId: string | null, chunk: DocumentChunk, voice: ServerVoice, plan: PartPlan, background: boolean, attempt = 0): Promise<ReadyClip> {
    let existing = await this.ttsRepository.find(chunk.id, voice.id)
    if (existing?.status === 'GENERATING' && existing.provider === this.provider.name && Date.now() - existing.updatedAt.getTime() < STALE_GENERATING_MS) {
      // Another request is voicing it (possibly before an edit); reuse it if it's current
      existing = await this.waitForOther(chunk.id, voice.id)
    }
    if (this.isCurrent(existing, plan)) return existing as ReadyClip
    // Read before the old clip goes: redone sentences are spliced into it
    const start = await this.reusableBase(existing, plan)
    if (existing) await this.discard(existing)

    const spliced = plan.sentences.length > 0
    const takes = Object.fromEntries(plan.sentences.map((s) => [s.index, s.take]))
    const hash = spliced ? spliceHash(this.provider.name, voice, plan) : blobHash(this.provider.name, voice, plan)
    const clipFields = { renderKey: plan.key, baseKey: plan.base.key, sentenceTakes: spliced ? takes : undefined, charCount: chunk.text.length }
    const shared = await this.ttsRepository.findBlob(hash)
    if (shared) {
      try {
        const clip = await this.ttsRepository.create({
          chunkId: chunk.id,
          voiceId: voice.id,
          status: 'READY',
          provider: this.provider.name,
          model: shared.model,
          ...clipFields,
          blobHash: hash,
          storageKey: shared.storageKey,
          mimeType: shared.mimeType,
          durationMs: shared.durationMs,
        })
        return clip as ReadyClip
      } catch (e) {
        if (isUniqueViolation(e)) return this.afterRace(userId, chunk, voice, plan, background, attempt)
        // The shared file was cleaned up a moment ago; make it again below
        if (!isForeignKeyViolation(e)) throw e
      }
    }

    // Only what will be newly recorded has to fit in the allowance
    const spans = chunk.sentences as unknown as { start: number; end: number }[]
    const newChars = spliced
      ? (start ? 0 : chunk.text.length) +
        plan.sentences.filter((s) => start?.takes[s.index] !== s.take).reduce((n, s) => n + (spans[s.index].end - spans[s.index].start), 0)
      : chunk.text.length
    const estimatedSec = newChars / CHARS_PER_SECOND[voice.language]
    if (this.provider.billable && newChars && userId) await this.usageService.assertAvailable(userId, voice, estimatedSec, newChars)

    let row: AudioClip
    try {
      row = await this.ttsRepository.create({ chunkId: chunk.id, voiceId: voice.id, provider: this.provider.name, model: voice.model, ...clipFields })
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
      return this.afterRace(userId, chunk, voice, plan, background, attempt)
    }

    try {
      let audio: Buffer
      let durationMs: number
      let model = voice.model
      let mimeType = 'audio/mpeg'
      let extension = 'mp3'
      if (spliced) {
        ;({ mp3: audio, durationMs } = await this.splice(userId, chunk, voice, plan, start, background))
      } else {
        const result = await this.provider.synthesize({ text: plan.input, voice, style: plan.style, background })
        ;({ audio, model, mimeType, extension } = result)
        durationMs = result.durationMs ?? (await measureMs(result.audio, result.mimeType, estimatedSec))
        await this.charge(userId, chunk.documentId, voice, durationMs, chunk.text.length, result.route)
      }
      const storageKey = `audio/blobs/${hash.slice(0, 2)}/${hash}.${extension}`
      await storage.put(storageKey, audio, mimeType)
      await this.ttsRepository.saveBlob({ hash, storageKey, mimeType, durationMs, model, sizeBytes: audio.length })
      this.analyse(hash, audio, mimeType)

      const ready = await this.ttsRepository.update(row.id, {
        status: 'READY',
        storageKey,
        mimeType,
        durationMs,
        provider: this.provider.name,
        model,
        blobHash: hash,
      })
      return ready as ReadyClip
    } catch (e) {
      await this.ttsRepository.update(row.id, { status: 'FAILED', error: e instanceof Error ? e.message.slice(0, 500) : 'Unknown error' })
      throw e
    }
  }

  /** Another request created this clip's row first: use its result, or retry if it's stale */
  private async afterRace(userId: string | null, chunk: DocumentChunk, voice: ServerVoice, plan: PartPlan, background: boolean, attempt: number) {
    const other = await this.waitForOther(chunk.id, voice.id)
    return this.isCurrent(other, plan) || attempt >= 2 ? (other as ReadyClip) : this.generate(userId, chunk, voice, plan, background, attempt + 1)
  }

  /**
   * A clip whose audio file has gone missing from storage: forget it, and the
   * shared file record, so the next request makes it again instead of failing.
   */
  async forgetMissing(clip: AudioClip) {
    if (clip.blobHash) await this.ttsRepository.forgetBlob(clip.blobHash)
    else await this.ttsRepository.delete(clip.id)
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
  async voiceText(
    userId: string | null,
    text: string,
    expressions: ChunkExpressions,
    voice: VoiceDefinition,
    narration?: string | null,
    lexicon: Lexicon = EMPTY_LEXICON,
  ) {
    if (!isServerVoice(voice)) throw phoneVoiceError()
    const plan = planRender(text, expressions, voice, narration, { lexicon })
    if (this.provider.billable && userId && !(await this.ttsRepository.findBlob(blobHash(this.provider.name, voice, plan)))) {
      await this.usageService.assertAvailable(userId, voice, text.length / CHARS_PER_SECOND[voice.language], text.length)
    }
    return this.voicePiece(userId, null, voice, plan, text.length, false)
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
