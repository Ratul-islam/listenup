import { CHARS_PER_SECOND } from '../../config/constants.js'
import { env } from '../../config/env.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { hasLiveJob, startQueue, queue, QUEUES } from '../../lib/queue.js'
import { AppError } from '../../utils/AppError.js'
import { toSummary } from '../documents/documents.service.js'
import { LANGS, type Lang } from '../ingestion/text/language.js'
import { planAtLeast } from '../plans/plan-catalog.js'
import type { UsageService } from '../usage/usage.service.js'
import {
  autoExpress,
  BRIEF_SAMPLE_CHARS,
  describeDelivery,
  MAX_AUTO_EXPRESSION_CHARS,
  MIN_AUTO_EXPRESSION_CHARS,
  writeBrief,
  type StoryBrief,
} from './auto-expression.js'
import {
  NARRATION_STYLES,
  narrationText,
  normalizeExpressions,
  readExpressions,
  type ChunkExpressions,
  type EmotionMark,
  type NarrationStrength,
  type NarrationStyleId,
} from './expression-catalog.js'
import type { ExpressionsRepository } from './expressions.repository.js'
import type { DescribeBody, NarrationBody } from './expressions.schema.js'

// Expressive minutes left are turned into text to direct, with some to spare
const DIRECT_AHEAD_FACTOR = 1.2

const plusRequired = () => new AppError('"Make it expressive" is part of Plus and Pro.', 403, 'PREMIUM_REQUIRED')

/** Emotions and sounds on a document's text, set by the listener or suggested by AI */
export class ExpressionsService {
  constructor(
    private readonly expressionsRepository: ExpressionsRepository,
    private readonly usageService: UsageService,
  ) {}

  private async readyDocument(userId: string, documentId: string) {
    const doc = await this.expressionsRepository.findOwned(userId, documentId)
    if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
    if (doc.status !== 'READY') throw new AppError('This document is still being prepared', 409, 'DOCUMENT_NOT_READY')
    return doc
  }

  private async plan(userId: string) {
    return (await this.expressionsRepository.findUserPlan(userId))?.plan
  }

  private async assertPlus(userId: string) {
    if (!planAtLeast(await this.plan(userId), 'plus')) throw plusRequired()
  }

  /**
   * "Say it like a scared little child": the listener's words become an
   * emotion and a direction on part of a chunk. Open to every plan; it's one
   * small request.
   */
  async describe(userId: string, documentId: string, index: number, { start, end, description }: DescribeBody) {
    await this.readyDocument(userId, documentId)
    const chunk = await this.expressionsRepository.findChunk(documentId, index)
    if (!chunk) throw new AppError('That part of the document does not exist', 404, 'CHUNK_NOT_FOUND')
    if (end > chunk.text.length || !/[\p{L}\p{N}]/u.test(chunk.text.slice(start, end))) {
      throw new AppError('Choose some words to direct', 400, 'EMPTY_SELECTION')
    }
    if (chunk.locked) throw new AppError('This part is locked. Unlock it to change how it sounds.', 423, 'PART_LOCKED')
    const delivery = await describeDelivery(chunk.text.slice(start, end), description, env.OPENROUTER_TEXT_MODEL)
    const mark: EmotionMark = { start, end, emotion: delivery.emotion, ...(delivery.strong && { strong: true }), ...(delivery.direction && { direction: delivery.direction }) }
    const current = readExpressions(chunk.expressions)
    // Marks overlapping the selection are trimmed around it, as in the app
    const emotions = current.emotions.flatMap((m) =>
      m.end <= start || m.start >= end
        ? [m]
        : [...(m.start < start ? [{ ...m, end: start }] : []), ...(m.end > end ? [{ ...m, start: end }] : [])],
    )
    const expressions = normalizeExpressions({ emotions: [...emotions, mark], sounds: current.sounds }, chunk.text.length)
    await this.expressionsRepository.setChunk(chunk.id, expressions)
    return { expressions, mark }
  }

  /** The narration text a style resolves to (auto uses what the brief found) */
  private resolve(style: NarrationStyleId | 'auto' | null, strength: NarrationStrength, brief: StoryBrief | null) {
    if (!style) return null
    if (style === 'auto') return brief ? narrationText(brief.narrator, strength) : null
    return narrationText(NARRATION_STYLES[style], strength)
  }

  /**
   * Changes how the whole document is narrated without a new AI run (or turns
   * it off). Lines play in the new style from the next part that's voiced.
   */
  async setNarration(userId: string, documentId: string, { style, strength }: NarrationBody) {
    const doc = await this.readyDocument(userId, documentId)
    await this.assertPlus(userId)
    const brief = (doc.narrationBrief as StoryBrief | null) ?? null
    await this.expressionsRepository.stampNarration(documentId, this.resolve(style, strength, brief))
    return toSummary(await this.expressionsRepository.setNarration(documentId, { narrationStyle: style, narrationStrength: style ? strength : null }))
  }

  /** "Make it expressive": sets the narration style, then directs the lines ahead in the background */
  async startAuto(userId: string, documentId: string, { style, strength }: NarrationBody) {
    const doc = await this.readyDocument(userId, documentId)
    await this.assertPlus(userId)
    // A job lost to a restart leaves the status RUNNING; start a new one then
    if (doc.autoExpression === 'RUNNING' && (await hasLiveJob(QUEUES.autoExpression, documentId))) return toSummary(doc)

    const chosen = style ?? 'auto'
    // A chosen style plays right away; "auto" waits for the brief
    if (chosen !== 'auto') await this.expressionsRepository.stampNarration(documentId, this.resolve(chosen, strength, null))
    await this.expressionsRepository.setNarration(documentId, { narrationStyle: chosen, narrationStrength: strength })
    const saved = await this.expressionsRepository.setAutoStatus(documentId, 'RUNNING')
    await startQueue()
    await queue.send(QUEUES.autoExpression, { documentId }, { singletonKey: documentId })
    return toSummary(saved)
  }

  /**
   * Job body: writes the story brief, then directs from where the listener is,
   * as far as their Expressive minutes reach. Pro gets the stronger model.
   */
  async runAuto(documentId: string) {
    const doc = await this.expressionsRepository.findById(documentId)
    if (!doc || doc.status !== 'READY') return
    const model = planAtLeast(await this.plan(doc.userId), 'pro') ? env.OPENROUTER_DIRECTOR_PRO_MODEL : env.OPENROUTER_TEXT_MODEL
    const strength = (doc.narrationStrength as NarrationStrength | null) ?? 'balanced'
    const style = (doc.narrationStyle as NarrationStyleId | 'auto' | null) ?? 'auto'

    const from = doc.playback[0]?.chunkIndex ?? 0
    const lang: Lang = LANGS.includes(doc.language as Lang) ? (doc.language as Lang) : 'en'
    const remainingSec = (await this.usageService.summary(doc.userId)).expressive.remainingSec
    const budget = Math.min(MAX_AUTO_EXPRESSION_CHARS, Math.max(MIN_AUTO_EXPRESSION_CHARS, remainingSec * CHARS_PER_SECOND[lang] * DIRECT_AHEAD_FACTOR))

    const ahead = await this.expressionsRepository.listChunks(documentId, Math.max(from - 1, 0))
    const before = from > 0 ? (ahead.shift()?.text ?? '') : ''
    // Locked parts keep how they sound; they still give the AI context
    const unlocked = new Set((await this.expressionsRepository.listUnlockedChunks(documentId, from)).map((c) => c.id))
    const chunks = []
    let total = 0
    for (const chunk of ahead) {
      if ((total += chunk.text.length) > budget && chunks.length) break
      chunks.push(chunk)
    }

    const opening = (await this.expressionsRepository.firstChunks(documentId, 20)).map((c) => c.text).join(' ').slice(0, BRIEF_SAMPLE_CHARS)
    const current = chunks.map((c) => c.text).join(' ').slice(0, BRIEF_SAMPLE_CHARS)
    const brief = await writeBrief(from > 0 ? [opening, current] : [opening], model)
    await this.expressionsRepository.setNarration(documentId, { narrationBrief: brief as unknown as Prisma.InputJsonValue })
    if (style === 'auto') await this.expressionsRepository.stampNarration(documentId, this.resolve('auto', strength, brief))

    const updates = await autoExpress(chunks, { brief, strength, model, before })
    await this.expressionsRepository.setChunks(updates.filter((u) => unlocked.has(u.id)))
    await this.expressionsRepository.setAutoStatus(documentId, 'DONE')
  }

  async failAuto(documentId: string) {
    await this.expressionsRepository.setAutoStatus(documentId, 'FAILED').catch(() => {})
  }

  /** Removes every mark, or only AI suggestions (the narration style stays) */
  async clear(userId: string, documentId: string, onlyAi: boolean) {
    await this.readyDocument(userId, documentId)
    const chunks = await this.expressionsRepository.listExpressiveChunks(documentId)
    const updates = chunks.map((c) => {
      const e = readExpressions(c.expressions)
      const expressions: ChunkExpressions = onlyAi
        ? { emotions: e.emotions.filter((m) => !m.ai), sounds: e.sounds.filter((m) => !m.ai) }
        : { emotions: [], sounds: [] }
      return { id: c.id, expressions }
    })
    await this.expressionsRepository.setChunks(updates)
    return { chunks: updates.length }
  }
}
