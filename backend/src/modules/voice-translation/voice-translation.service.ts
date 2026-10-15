import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { OWN_VOICE_CONSENT_MAX_SEC, OWN_VOICE_CONSENT_MIN_SEC, OWN_VOICE_MIN_SEC, VOICE_TRANSLATION_MAX_SEC, VOICE_TRANSLATIONS_PER_MONTH } from '../../config/constants.js'
import { env, ttsProviderName } from '../../config/env.js'
import { Prisma, type Document, type SpeakerVoice } from '../../generated/prisma/client.js'
import { pcmToMp3 } from '../../lib/audio/encode.js'
import { pausesIn } from '../../lib/audio/pauses.js'
import { samplesOf, toSpeechWav } from '../../lib/audio/recording.js'
import { createReplicatedVoice } from '../../lib/gemini.js'
import { queue, QUEUES, startQueue } from '../../lib/queue.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import type { Lang } from '../ingestion/text/language.js'
import { inUnitedStates, ownVoiceBlockedIn } from '../own-voice/own-voice.regions.js'
import { scriptFor } from '../own-voice/own-voice.scripts.js'
import { OWN_VOICE_PLAN, planAtLeast, planFor } from '../plans/plan-catalog.js'
import { speakerVoiceId } from '../voices/speaker-voice.js'
import { transcribeAndTranslate } from './transcribe.js'
import type { VoiceTranslationRepository } from './voice-translation.repository.js'
import type { ConsentBody, CreateBody, UploadStartBody } from './voice-translation.schema.js'

const RATE = 24_000
const UPLOAD_LINK_TTL_SECONDS = 15 * 60
// Shorter than this and there's too little to translate, or to hear the speaker by
const MIN_RECORDING_SEC = 5
// The stretch of the recording the speaker's voice is made from: Google takes 10 to 30 seconds
const EXCERPT_SEC = 25

const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
  amr: 'audio/amr',
}

const mockCloning = ttsProviderName === 'mock'
const canClone = () => mockCloning || !!env.GEMINI_API_KEY

type Block = 'plan' | 'region' | 'setup' | 'limit'
const BLOCK_ERRORS: Record<Block, () => AppError> = {
  plan: () => new AppError(`Voice translation is part of the ${planFor(OWN_VOICE_PLAN).name} plan.`, 402, 'PLAN_REQUIRED'),
  region: () => new AppError('Making a voice from a recording isn’t available where you are.', 403, 'OWN_VOICE_REGION'),
  setup: () => new AppError('Voice translation isn’t available yet.', 503, 'VOICE_TRANSLATION_UNAVAILABLE'),
  limit: () => new AppError(`You can translate ${VOICE_TRANSLATIONS_PER_MONTH} recordings a month. Try again next month.`, 429, 'VOICE_TRANSLATION_LIMIT'),
}

/** What a voice translation keeps about itself, in the document's studio settings */
interface TranslationInfo {
  status: 'listening' | 'ready' | 'failed'
  to: Lang
  /** The language that was spoken, once heard */
  from?: Lang | null
  transcript?: string
  durationSec?: number
  /** The uploaded recording, until it's been heard (then it's deleted) */
  recordingKey?: string | null
  /** The stretch of the recording the speaker's voice is made from */
  speakerKey?: string | null
  error?: string | null
}

const keysFor = (userId: string, documentId: string) => {
  const dir = `documents/${userId}/${documentId}`
  return { dir, speaker: `${dir}/speaker.wav`, consent: `${dir}/consent.wav`, text: `${dir}/source.txt` }
}

const translationOf = (doc: Pick<Document, 'studio'>): TranslationInfo | null => {
  const t = (doc.studio as { translation?: TranslationInfo } | null)?.translation
  return t && typeof t === 'object' && t.to ? t : null
}

const withTranslation = (doc: Pick<Document, 'studio'>, info: TranslationInfo) =>
  ({ ...((doc.studio as object | null) ?? {}), translation: info }) as unknown as Prisma.InputJsonValue

/** A WAV file of 16-bit mono samples */
function wavOf(pcm: Buffer, rate: number) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/**
 * The stretch of a recording with the most speech in it, to make the speaker's voice from:
 * EXCERPT_SEC long (or all of it), found by sliding along the silences. Null when no stretch
 * has enough speech (OWN_VOICE_MIN_SEC) to make a voice that sounds like them.
 */
function speakerExcerpt(pcm: Buffer) {
  const count = Math.floor(pcm.length / 2)
  const samples = new Float32Array(count)
  for (let i = 0; i < count; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768
  const totalMs = (count / RATE) * 1000
  const windowMs = Math.min(EXCERPT_SEC * 1000, totalMs)
  const pauses = pausesIn({ samples, sampleRate: RATE })
  const speechIn = (from: number, to: number) => to - from - pauses.reduce((ms, [a, b]) => ms + Math.max(0, Math.min(b, to) - Math.max(a, from)), 0)
  let best = { from: 0, speech: -1 }
  // Starting at the end of a pause (or the very start), so it doesn't open mid-word
  for (const from of [0, ...pauses.map(([, end]) => end)]) {
    if (from + windowMs > totalMs) break
    const speech = speechIn(from, from + windowMs)
    if (speech > best.speech) best = { from, speech }
  }
  if (best.speech < OWN_VOICE_MIN_SEC * 1000) return null
  const start = Math.round((best.from / 1000) * RATE) * 2
  return wavOf(pcm.subarray(start, start + Math.round((windowMs / 1000) * RATE) * 2), RATE)
}

/** What Google said when making the speaker's voice, as something to act on */
function creationError(e: unknown) {
  const status = e instanceof AppError ? e.statusCode : 0
  console.error(`[voice-translation] ${e instanceof Error ? e.message : e}`)
  if (status === 400 || status === 422) {
    return new AppError(
      'Google couldn’t match the consent recording to the speaker in your recording. It has to be the same person, reading the sentence in full in a quiet room.',
      422,
      'OWN_VOICE_REJECTED',
    )
  }
  if (status === 401 || status === 403 || status === 404) return BLOCK_ERRORS.setup()
  return new AppError('We couldn’t make the speaker’s voice just now. Try again in a moment.', 503, 'OWN_VOICE_UNAVAILABLE')
}

/**
 * Voice translation (Pro): a recording of someone speaking is written down and translated,
 * and becomes a script in Studio, the translation split into parts that can be edited like
 * any script. Once the speaker records Google's consent sentence, their voice is cloned and
 * reads the translation. The uploaded recording is deleted once it's been heard; the 25
 * seconds the voice is made from and the consent recording are kept privately with the
 * script, to renew the voice each week, and go with it.
 */
export class VoiceTranslationService {
  constructor(private readonly repository: VoiceTranslationRepository) {}

  private async blockFor(userId: string, { starting }: { starting: boolean }): Promise<Block | null> {
    const owner = await this.repository.findOwner(userId)
    if (!owner) throw new AppError('User not found', 404, 'USER_NOT_FOUND')
    if (!canClone()) return 'setup'
    if (!planAtLeast(owner.plan, OWN_VOICE_PLAN)) return 'plan'
    if (ownVoiceBlockedIn(owner.billingCountry, owner.timeZone)) return 'region'
    if (starting && (await this.repository.countThisMonth(userId)) >= VOICE_TRANSLATIONS_PER_MONTH) return 'limit'
    return null
  }

  private async assertAllowed(userId: string, starting: boolean) {
    const block = await this.blockFor(userId, { starting })
    if (block) throw BLOCK_ERRORS[block]()
  }

  /** A link the phone uploads the recording to directly; its id becomes the translation's */
  async startUpload(userId: string, { fileName, size }: UploadStartBody) {
    await this.assertAllowed(userId, true)
    const ext = path.extname(fileName).slice(1).toLowerCase()
    const mime = AUDIO_TYPES[ext]
    if (!mime) throw new AppError('That isn’t an audio file we can read. Try MP3, M4A, WAV or OGG.', 415, 'UNSUPPORTED_FILE')
    if (size > env.MAX_UPLOAD_MB * 1024 * 1024) throw new AppError(`That recording is too large (the limit is ${env.MAX_UPLOAD_MB} MB). Try an MP3 or M4A.`, 413, 'FILE_TOO_LARGE')
    const uploadId = randomUUID()
    const url = await storage.signedUploadUrl(`${keysFor(userId, uploadId).dir}/recording.${ext}`, mime, size, UPLOAD_LINK_TTL_SECONDS)
    return { uploadId, url, method: 'PUT' as const, headers: { 'Content-Type': mime } }
  }

  /** Starts translating an uploaded recording: it becomes a script, filled in once it's been heard */
  async create(userId: string, { uploadId, fileName, to }: CreateBody) {
    await this.assertAllowed(userId, true)
    const ext = path.extname(fileName).slice(1).toLowerCase()
    const recordingKey = `${keysFor(userId, uploadId).dir}/recording.${ext}`
    const size = AUDIO_TYPES[ext] ? await storage.size(recordingKey) : null
    if (!size) throw new AppError("The upload didn't finish. Try again.", 400, 'UPLOAD_NOT_FOUND')
    const title = path.basename(fileName, path.extname(fileName)).replace(/[_-]+/g, ' ').trim().slice(0, 180) || 'Recording'
    const info: TranslationInfo = { status: 'listening', to, recordingKey }
    const doc = await this.repository.createDocument({
      id: uploadId,
      userId,
      title,
      kind: 'TEXT',
      mimeType: AUDIO_TYPES[ext],
      fileName: fileName.slice(0, 255),
      status: 'PROCESSING',
      languageHint: to,
      isScript: true,
      studio: withTranslation({ studio: null }, info),
    })
    await startQueue()
    await queue.send(QUEUES.voiceTranslation, { documentId: doc.id })
    return this.view(doc, null)
  }

  /**
   * The background step: hears the recording, keeps the stretch the voice is made from, and
   * hands the translation to the usual import, which splits it into parts.
   */
  async process(documentId: string, { finalAttempt }: { finalAttempt: boolean }) {
    const doc = await this.repository.findDocument(documentId)
    const info = doc && translationOf(doc)
    if (!doc || !info || info.status !== 'listening' || !info.recordingKey) return
    try {
      const recording = await toSpeechWav(await storage.get(info.recordingKey), VOICE_TRANSLATION_MAX_SEC)
      if (recording.durationSec < MIN_RECORDING_SEC) throw new AppError('That recording is too short to translate.', 422, 'RECORDING_TOO_SHORT')
      const pcm = samplesOf(recording.wav)
      const heard = await transcribeAndTranslate(pcmToMp3(pcm, RATE), info.to, doc.userId)
      if (!heard.translation) throw new AppError('We couldn’t hear anyone speaking in that recording.', 422, 'RECORDING_SILENT')
      const keys = keysFor(doc.userId, doc.id)
      const excerpt = speakerExcerpt(pcm)
      await Promise.all([
        storage.put(keys.text, Buffer.from(heard.translation, 'utf8'), 'text/plain; charset=utf-8'),
        excerpt ? storage.put(keys.speaker, excerpt, 'audio/wav') : Promise.resolve(),
      ])
      const ready: TranslationInfo = {
        status: 'ready',
        to: info.to,
        from: heard.language,
        transcript: heard.transcript,
        durationSec: Math.round(recording.durationSec),
        recordingKey: null,
        speakerKey: excerpt ? keys.speaker : null,
        error: null,
      }
      await this.repository.updateDocument(doc.id, { fileKey: keys.text, mimeType: 'text/plain', status: 'PENDING', studio: withTranslation(doc, ready) })
      // The recording itself isn't kept
      await storage.delete(info.recordingKey).catch(() => {})
      await startQueue()
      await queue.send(QUEUES.processDocument, { documentId: doc.id })
    } catch (e) {
      console.error(`[voice-translation] ${documentId} failed`, e)
      if (!finalAttempt && !(e instanceof AppError && e.statusCode < 500)) throw e
      const error = e instanceof AppError && e.statusCode < 500 ? e.message : 'We couldn’t translate this recording. Try again.'
      await this.repository.updateDocument(doc.id, { status: 'FAILED', error, studio: withTranslation(doc, { ...info, status: 'failed', error }) })
      await storage.delete(info.recordingKey).catch(() => {})
    }
  }

  /** A translation as the app shows it: what was said, what the speaker reads to consent, and their voice */
  async state(userId: string, documentId: string) {
    const doc = await this.repository.findOwnedDocument(userId, documentId)
    if (!doc || !translationOf(doc)) throw new AppError('Translation not found', 404, 'DOCUMENT_NOT_FOUND')
    return this.view(doc, doc.speakerVoice, await this.blockFor(userId, { starting: false }), (await this.repository.findOwner(userId)) ?? undefined)
  }

  private view(
    doc: Document,
    voice: SpeakerVoice | null,
    blockedBy: Block | null = null,
    owner?: { billingCountry: string | null; timeZone: string | null },
  ) {
    const info = translationOf(doc)!
    // The speaker reads Google's sentence in the language they spoke, or English when there's none for it
    const consent = scriptFor(info.from ?? 'en') ?? scriptFor('en')!
    return {
      documentId: doc.id,
      status: info.status,
      from: info.from ?? null,
      to: info.to,
      transcript: info.transcript ?? null,
      durationSec: info.durationSec ?? null,
      error: info.error ?? null,
      speaker: {
        /** "none": no voice yet; "ready": the translation is read in it; "unavailable": too little clear speech to make one */
        status: voice?.providerVoiceId ? ('ready' as const) : info.status === 'ready' && !info.speakerKey ? ('unavailable' as const) : ('none' as const),
        voiceId: voice?.providerVoiceId ? speakerVoiceId(voice.id, info.to) : null,
        consentedAt: voice?.consentedAt?.toISOString() ?? null,
      },
      consent: { language: consent.language, sentence: consent.consent, sec: { min: OWN_VOICE_CONSENT_MIN_SEC, max: OWN_VOICE_CONSENT_MAX_SEC } },
      canClone: !blockedBy,
      blockedBy,
      /** Ask the listener to confirm the speaker isn't in Illinois or Texas */
      askState: owner ? inUnitedStates(owner.billingCountry, owner.timeZone) : false,
    }
  }

  /**
   * Makes the speaker's voice from the stretch kept from the recording and their consent
   * recording (Google checks it's the same person saying its sentence), and reads the
   * translation in it from now on.
   */
  async consent(userId: string, documentId: string, { consent, language, confirm }: ConsentBody) {
    await this.assertAllowed(userId, false)
    const owner = await this.repository.findOwner(userId)
    if (inUnitedStates(owner?.billingCountry, owner?.timeZone) && !confirm.notInRestrictedState) throw BLOCK_ERRORS.region()
    const doc = await this.repository.findOwnedDocument(userId, documentId)
    const info = doc && translationOf(doc)
    if (!doc || !info) throw new AppError('Translation not found', 404, 'DOCUMENT_NOT_FOUND')
    if (info.status !== 'ready') throw new AppError('The recording is still being translated.', 409, 'NOT_READY')
    if (!info.speakerKey) throw new AppError('There isn’t enough clear speech in the recording to make the speaker’s voice.', 422, 'NOT_ENOUGH_SPEECH')
    if (!scriptFor(language)) throw new AppError('There’s no consent sentence in that language.', 400, 'INVALID_LANGUAGE')

    const sentence = await toSpeechWav(Buffer.from(consent, 'base64'), OWN_VOICE_CONSENT_MAX_SEC)
    if (sentence.durationSec < OWN_VOICE_CONSENT_MIN_SEC) throw new AppError('That was too short for the consent sentence. Read all of it.', 400, 'RECORDING_TOO_SHORT')
    const sourceWav = await storage.get(info.speakerKey)
    const model = env.TTS_MODEL_MULTILINGUAL
    let key: string
    try {
      key = mockCloning ? `mock_speaker_${doc.id}` : await createReplicatedVoice({ model, displayName: `listenup-speaker-${doc.id}`, sourceWav, consentWav: sentence.wav, store: false })
    } catch (e) {
      throw creationError(e)
    }
    const keys = keysFor(userId, doc.id)
    await storage.put(keys.consent, sentence.wav, 'audio/wav')
    const now = new Date()
    const fields = { providerVoiceId: key, model, consentLanguage: language, consentedAt: now, sourceKey: info.speakerKey, consentKey: keys.consent, providerCreatedAt: now }
    const voice = await this.repository.upsertSpeakerVoice(doc.id, { userId, ...fields }, { ...fields, version: { increment: 1 } })
    await this.repository.useVoice(userId, doc.id, speakerVoiceId(voice.id, info.to))
    return this.view(doc, voice, null, owner ?? undefined)
  }
}
