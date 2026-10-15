import { CHARS_PER_SECOND } from '../../config/constants.js'
import { env } from '../../config/env.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { pcmToMp3 } from '../../lib/audio/encode.js'
import { createHash } from 'node:crypto'
import { paceOf } from '../../lib/audio/length.js'
import { measure, packPerformance, samplesOfPcm } from '../../lib/audio/prosody.js'
import { storage } from '../../lib/storage/storage.js'
import { samplesOf, toSpeechWav } from '../../lib/audio/recording.js'
import { hasLiveJob, startQueue, queue, QUEUES } from '../../lib/queue.js'
import { AppError } from '../../utils/AppError.js'
import { toSummary } from '../documents/documents.service.js'
import { LANGS, type Lang } from '../ingestion/text/language.js'
import { planAtLeast } from '../plans/plan-catalog.js'
import type { UsageService } from '../usage/usage.service.js'
import { findVoice, isServerVoice } from '../voices/voice-catalog.js'
import {
  autoExpress,
  BRIEF_SAMPLE_CHARS,
  describeDelivery,
  findCast,
  hearDelivery,
  MAX_AUTO_EXPRESSION_CHARS,
  MIN_AUTO_EXPRESSION_CHARS,
  readCast,
  writeBrief,
  type StoryBrief,
} from './auto-expression.js'
import {
  NARRATION_STYLES,
  narrationText,
  normalizeExpressions,
  performanceKey,
  readExpressions,
  wordsKey,
  type ChunkExpressions,
  type EmotionMark,
  type NarrationStrength,
  type NarrationStyleId,
  type PerformanceRef,
  type SoundMark,
} from './expression-catalog.js'
import type { ExpressionsRepository } from './expressions.repository.js'
import type { CastBody, DeliveryBody, DescribeBody, NarrationBody } from './expressions.schema.js'

// Expressive minutes left are turned into text to direct, with some to spare
const DIRECT_AHEAD_FACTOR = 1.2
// "Say it yourself": the most of a recording that's listened to (a part read aloud is about half a minute)
const MAX_DELIVERY_SEC = 45
// A recording with less speech in it than this can't be told from the room it was made in
const MIN_PERFORMED_FRAMES = 20

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
    const chunk = await this.directable(userId, documentId, index, start, end)
    const delivery = await describeDelivery(chunk.text.slice(start, end), description, env.OPENROUTER_TEXT_MODEL, userId)
    return this.direct(chunk, { start, end, emotion: delivery.emotion, ...(delivery.strong && { strong: true }), ...(delivery.direction && { direction: delivery.direction }) })
  }

  /**
   * "Say it yourself": the listener records the words the way they want to
   * hear them. Two things are taken from the recording:
   * - Its measurements (when each sound is said, where they stop, the tune of
   *   their voice, where they press on a word), which the story's voice is
   *   shaped to when the words are voiced: see reshape.
   * - What AI hears in it once: the feeling and how it's said in words, which
   *   the voice is directed with. A shape can't make a voice whisper or
   *   tremble; a direction can.
   * The recording itself isn't kept. Open to every plan, like describe().
   */
  async follow(userId: string, documentId: string, index: number, { start, end, recording }: DeliveryBody) {
    const chunk = await this.directable(userId, documentId, index, start, end)
    const { wav } = await toSpeechWav(Buffer.from(recording, 'base64'), MAX_DELIVERY_SEC)
    const line = chunk.text.slice(start, end)
    const pcm = samplesOf(wav)
    const language: Lang = LANGS.includes(chunk.language as Lang) ? (chunk.language as Lang) : 'en'
    const heard = await hearDelivery(line, pcmToMp3(pcm, 24_000), env.OPENROUTER_LISTEN_MODEL, userId, paceOf(pcm, 24_000, line, language))
    if (!heard.said) throw new AppError('That didn’t sound like this line. Say the line itself, the way you want to hear it.', 400, 'DELIVERY_NOT_HEARD')
    const pauses: SoundMark[] = heard.pauses.map((p) => ({ at: start + p.at, sound: p.long ? 'long-pause' : 'pause' }))
    const shape = await this.keepPerformance(pcm, line, `${userId}/${documentId}`)
    const saved = await this.direct(
      chunk,
      { start, end, emotion: heard.emotion, ...(heard.strong && { strong: true }), ...(heard.direction && { direction: heard.direction }), ...(shape && { shape }) },
      pauses,
    )
    return { ...saved, pauses: pauses.length, shaped: !!shape }
  }

  /**
   * Measures how the words were said and keeps the measurements (not the
   * recording) with the document's files, for when the words are voiced.
   * Null when there's too little speech in the recording to follow, or it
   * couldn't be kept: the words are then voiced from the direction alone.
   */
  private async keepPerformance(pcm: Buffer, line: string, home: string): Promise<PerformanceRef | null> {
    try {
      const said = measure(samplesOfPcm(pcm), 24_000, { recording: true })
      if (said.speech.reduce((n, s) => n + s, 0) < MIN_PERFORMED_FRAMES) return null
      const kept = JSON.stringify(packPerformance(said))
      const id = createHash('sha256').update(kept).digest('hex').slice(0, 24)
      const ref = { id, of: wordsKey(line), in: home }
      await storage.put(performanceKey(ref), Buffer.from(kept), 'application/json')
      return ref
    } catch (e) {
      console.warn(`[expressions] a performance couldn't be kept: ${e instanceof Error ? e.message : e}`)
      return null
    }
  }

  /** A part whose words [start, end) can be given a direction now */
  private async directable(userId: string, documentId: string, index: number, start: number, end: number) {
    await this.readyDocument(userId, documentId)
    const chunk = await this.expressionsRepository.findChunk(documentId, index)
    if (!chunk) throw new AppError('That part of the document does not exist', 404, 'CHUNK_NOT_FOUND')
    if (end > chunk.text.length || !/[\p{L}\p{N}]/u.test(chunk.text.slice(start, end))) {
      throw new AppError('Choose some words to direct', 400, 'EMPTY_SELECTION')
    }
    if (chunk.locked) throw new AppError('This part is locked. Unlock it to change how it sounds.', 423, 'PART_LOCKED')
    return chunk
  }

  /**
   * Puts the listener's direction on its words and saves the part. With
   * `pauses` (where they stopped while saying it), those replace the pauses
   * the words had inside them.
   */
  private async direct(chunk: { id: string; text: string; expressions: unknown }, mark: EmotionMark, pauses?: SoundMark[]) {
    const { start, end } = mark
    const current = readExpressions(chunk.expressions)
    // Marks overlapping the selection are trimmed around it, as in the app
    const emotions = current.emotions.flatMap((m) =>
      m.end <= start || m.start >= end
        ? [m]
        : [...(m.start < start ? [{ ...m, end: start }] : []), ...(m.end > end ? [{ ...m, start: end }] : [])],
    )
    const isPause = (m: SoundMark) => m.sound === 'pause' || m.sound === 'long-pause'
    const sounds = pauses ? [...current.sounds.filter((m) => !(isPause(m) && m.at > start && m.at < end) && !pauses.some((p) => p.at === m.at)), ...pauses] : current.sounds
    const expressions = normalizeExpressions({ emotions: [...emotions, mark], sounds, speakers: current.speakers }, chunk.text.length)
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
   * Job body: writes the story brief, then directs the whole text when it's
   * within reach of their Expressive minutes, otherwise from where the
   * listener is, as far as those reach. Pro gets the stronger model.
   */
  async runAuto(documentId: string) {
    const doc = await this.expressionsRepository.findById(documentId)
    if (!doc || doc.status !== 'READY') return
    const model = planAtLeast(await this.plan(doc.userId), 'pro') ? env.OPENROUTER_DIRECTOR_PRO_MODEL : env.OPENROUTER_TEXT_MODEL
    const strength = (doc.narrationStrength as NarrationStrength | null) ?? 'balanced'
    const style = (doc.narrationStyle as NarrationStyleId | 'auto' | null) ?? 'auto'

    const lang: Lang = LANGS.includes(doc.language as Lang) ? (doc.language as Lang) : 'en'
    const remainingSec = (await this.usageService.summary(doc.userId)).expressive.remainingSec
    const budget = Math.min(MAX_AUTO_EXPRESSION_CHARS, Math.max(MIN_AUTO_EXPRESSION_CHARS, remainingSec * CHARS_PER_SECOND[lang] * DIRECT_AHEAD_FACTOR))
    // A text that fits is directed whole. From where the listener is, the parts before them kept the
    // narrator reading everyone's lines, and the characters only got their voices from that part on.
    const from = doc.charCount <= budget ? 0 : (doc.playback[0]?.chunkIndex ?? 0)

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
    // Characters met in earlier runs keep their place, so they keep their voices
    const brief = await writeBrief(from > 0 ? [opening, current] : [opening], model, doc.userId, readCast(doc.narrationBrief))
    // More text than the brief read: look through all of it for the people who speak (the cheaper model is enough for a list)
    if (total > BRIEF_SAMPLE_CHARS) brief.characters = await findCast(chunks.map((c) => c.text), env.OPENROUTER_TEXT_MODEL, doc.userId, brief.characters)
    await this.expressionsRepository.setNarration(documentId, { narrationBrief: brief as unknown as Prisma.InputJsonValue })
    if (style === 'auto') await this.expressionsRepository.stampNarration(documentId, this.resolve('auto', strength, brief))

    // The director works for the narrator the listener hears: the style they chose, when they chose one.
    // (It used to direct for the style it guessed, so a story set to romance got a horror story's emotions.)
    const directed = style === 'auto' ? brief : { ...brief, style, narrator: NARRATION_STYLES[style] }
    const updates = await autoExpress(chunks, { brief: directed, strength, model, before, userId: doc.userId })
    await this.expressionsRepository.setChunks(updates.filter((u) => unlocked.has(u.id)))
    await this.expressionsRepository.setAutoStatus(documentId, 'DONE')
  }

  /**
   * A character's voice, chosen by the listener (null: back to the automatic
   * one). It's kept with the story's cast and stamped on each of their lines,
   * which are voiced again as they're played.
   */
  async setCastVoice(userId: string, documentId: string, { name, voiceId }: CastBody) {
    const doc = await this.readyDocument(userId, documentId)
    await this.assertPlus(userId)
    const voice = findVoice(voiceId)
    if (voiceId && (!voice || !isServerVoice(voice))) throw new AppError('Choose one of ListenUp’s voices for a character', 400, 'INVALID_VOICE')
    const cast = readCast(doc.narrationBrief)
    const character = cast.find((c) => c.name === name)
    if (!character) throw new AppError('That character isn’t in this story', 404, 'CHARACTER_NOT_FOUND')
    if (voiceId) character.voiceId = voiceId
    else delete character.voiceId

    const updates = (await this.expressionsRepository.listExpressiveChunks(documentId)).flatMap((c) => {
      const e = readExpressions(c.expressions)
      if (!e.speakers.some((m) => m.name === name)) return []
      const speakers = e.speakers.map((m) => {
        if (m.name !== name) return m
        const { voiceId: _automatic, ...line } = m
        return voiceId ? { ...line, voiceId } : line
      })
      return [{ id: c.id, expressions: { ...e, speakers } }]
    })
    await this.expressionsRepository.setChunks(updates)
    await this.expressionsRepository.setNarration(documentId, { narrationBrief: { ...(doc.narrationBrief as object), characters: cast } as unknown as Prisma.InputJsonValue })
    return { lines: updates.length }
  }

  /** Stops using character voices: every line goes back to the narrator. "Make it expressive" casts them again. */
  async removeCast(userId: string, documentId: string) {
    await this.readyDocument(userId, documentId)
    const updates = (await this.expressionsRepository.listExpressiveChunks(documentId)).flatMap((c) => {
      const e = readExpressions(c.expressions)
      return e.speakers.length ? [{ id: c.id, expressions: { ...e, speakers: [] } }] : []
    })
    await this.expressionsRepository.setChunks(updates)
    return { parts: updates.length }
  }

  async failAuto(documentId: string) {
    await this.expressionsRepository.setAutoStatus(documentId, 'FAILED').catch(() => {})
  }

  /** Removes every emotion and sound, or only AI suggestions (the narration style and the characters' voices stay) */
  async clear(userId: string, documentId: string, onlyAi: boolean) {
    await this.readyDocument(userId, documentId)
    const chunks = await this.expressionsRepository.listExpressiveChunks(documentId)
    const updates = chunks.map((c) => {
      const e = readExpressions(c.expressions)
      const expressions: ChunkExpressions = onlyAi
        ? { emotions: e.emotions.filter((m) => !m.ai), sounds: e.sounds.filter((m) => !m.ai), speakers: e.speakers }
        : { emotions: [], sounds: [], speakers: e.speakers }
      return { id: c.id, expressions }
    })
    await this.expressionsRepository.setChunks(updates)
    return { chunks: updates.length }
  }
}
