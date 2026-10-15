import {
  OWN_VOICE_ATTEMPTS_PER_MONTH,
  OWN_VOICE_CAPACITY,
  OWN_VOICE_CONSENT_MAX_SEC,
  OWN_VOICE_CONSENT_MIN_SEC,
  OWN_VOICE_MAX_SEC,
  OWN_VOICE_MIN_SEC,
  OWN_VOICE_RENEW_AFTER_DAYS,
} from '../../config/constants.js'
import { env, ttsProviderName } from '../../config/env.js'
import type { OwnVoice } from '../../generated/prisma/client.js'
import { toSpeechWav } from '../../lib/audio/recording.js'
import { createReplicatedVoice, deleteReplicatedVoice } from '../../lib/gemini.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { LANGS } from '../ingestion/text/language.js'
import { OWN_VOICE_PLAN, planAtLeast, planFor } from '../plans/plan-catalog.js'
import type { TtsService } from '../tts/tts.service.js'
import { ownVoiceIn } from '../voices/own-voice.js'
import type { OwnVoiceRepository } from './own-voice.repository.js'
import { inUnitedStates, ownVoiceBlockedIn } from './own-voice.regions.js'
import type { RecordBody } from './own-voice.schema.js'
import { scriptFor, VOICE_SCRIPTS } from './own-voice.scripts.js'

const DAY_MS = 24 * 60 * 60_000
const currentPeriod = () => new Date().toISOString().slice(0, 7)

/** Why a voice can't be recorded now */
export type RecordBlock = 'plan' | 'region' | 'setup' | 'limit' | 'full'

const BLOCK_ERRORS: Record<RecordBlock, () => AppError> = {
  plan: () => new AppError(`Your own voice is part of the ${planFor(OWN_VOICE_PLAN).name} plan.`, 402, 'PLAN_REQUIRED'),
  region: () => new AppError('Making a voice from a recording isn’t available where you are.', 403, 'OWN_VOICE_REGION'),
  setup: () => new AppError('Making a voice from a recording isn’t available yet.', 503, 'OWN_VOICE_UNAVAILABLE'),
  limit: () => new AppError(`You can record your voice ${OWN_VOICE_ATTEMPTS_PER_MONTH} times a month. Try again next month.`, 429, 'OWN_VOICE_LIMIT'),
  full: () => new AppError('We can’t take new voices just now. Try again in a few days.', 503, 'OWN_VOICE_FULL'),
}

// The mock voice (development without keys) plays tones for any voice, so a made-up id will do
const mockCloning = ttsProviderName === 'mock'
/** Whether this server can make a voice at all: it needs Google's own API */
const canClone = () => mockCloning || !!env.GEMINI_API_KEY

const recordingKeys = (userId: string) => ({ source: `own-voices/${userId}/source.wav`, consent: `own-voices/${userId}/consent.wav` })

/** What Google said, as something the speaker can act on */
function creationError(e: unknown) {
  const status = e instanceof AppError ? e.statusCode : 0
  console.error(`[own-voice] ${e instanceof Error ? e.message : e}`)
  // A refusal of the recordings themselves: most often the consent sentence wasn't matched to the speaker
  if (status === 400 || status === 422) {
    return new AppError('Google couldn’t make a voice from these recordings. Read both scripts in full, in a quiet room, without changing the words.', 422, 'OWN_VOICE_REJECTED')
  }
  if (status === 429) return BLOCK_ERRORS.full()
  if (status === 401 || status === 403 || status === 404) return BLOCK_ERRORS.setup()
  return new AppError('We couldn’t make your voice just now. Try again in a moment.', 503, 'OWN_VOICE_UNAVAILABLE')
}

/**
 * A listener's own voice (Pro): made from two recordings they read in the app,
 * a reading and Google's consent sentence. It's one voice per account, private
 * to it, counted as an Expressive voice, and erased with everything made in it
 * when they delete it. When Pro ends it's kept, and reads nothing until Pro is back.
 */
export class OwnVoiceService {
  constructor(
    private readonly ownVoiceRepository: OwnVoiceRepository,
    private readonly ttsService: TtsService,
  ) {}

  private attemptsLeft(voice: OwnVoice | null | undefined) {
    return Math.max(OWN_VOICE_ATTEMPTS_PER_MONTH - (voice?.attemptsPeriod === currentPeriod() ? voice.attempts : 0), 0)
  }

  private async blockFor(owner: NonNullable<Awaited<ReturnType<OwnVoiceRepository['findOwner']>>>): Promise<RecordBlock | null> {
    if (!canClone()) return 'setup'
    if (ownVoiceBlockedIn(owner.billingCountry, owner.timeZone)) return 'region'
    if (!planAtLeast(owner.plan, OWN_VOICE_PLAN)) return 'plan'
    if (!this.attemptsLeft(owner.ownVoice)) return 'limit'
    // Recording again replaces the voice they have, so it needs no new place
    if (!owner.ownVoice?.providerVoiceId && (await this.ownVoiceRepository.countStored()) >= OWN_VOICE_CAPACITY) return 'full'
    return null
  }

  /** The listener's voice, whether they can record one now, and what to read */
  async state(userId: string) {
    const owner = await this.ownVoiceRepository.findOwner(userId)
    if (!owner) throw new AppError('User not found', 404, 'USER_NOT_FOUND')
    const made = owner.ownVoice?.providerVoiceId ? owner.ownVoice : null
    const blockedBy = await this.blockFor(owner)
    return {
      /** "locked": they have a voice, but their plan doesn't include it now */
      status: !made ? ('none' as const) : planAtLeast(owner.plan, OWN_VOICE_PLAN) ? ('ready' as const) : ('locked' as const),
      voice: made ? { name: made.name, language: made.consentLanguage, recordedAt: made.consentedAt?.toISOString() ?? null } : null,
      canRecord: !blockedBy,
      blockedBy,
      plan: planFor(OWN_VOICE_PLAN).name,
      attemptsLeft: this.attemptsLeft(owner.ownVoice),
      /** Ask the speaker to confirm they aren't in Illinois or Texas */
      askState: inUnitedStates(owner.billingCountry, owner.timeZone),
      readingSec: { min: OWN_VOICE_MIN_SEC, max: OWN_VOICE_MAX_SEC },
      consentSec: { min: OWN_VOICE_CONSENT_MIN_SEC, max: OWN_VOICE_CONSENT_MAX_SEC },
      scripts: VOICE_SCRIPTS,
    }
  }

  /** Makes the listener's voice from their two recordings, replacing the one they had */
  async record(userId: string, { language, source, consent, confirm }: RecordBody) {
    const owner = await this.ownVoiceRepository.findOwner(userId)
    if (!owner) throw new AppError('User not found', 404, 'USER_NOT_FOUND')
    const blockedBy = await this.blockFor(owner)
    if (blockedBy) throw BLOCK_ERRORS[blockedBy]()
    if (!scriptFor(language)) throw new AppError('There’s no script to read in that language yet.', 400, 'INVALID_LANGUAGE')
    if (inUnitedStates(owner.billingCountry, owner.timeZone) && !confirm.notInRestrictedState) throw BLOCK_ERRORS.region()

    const [reading, sentence] = await Promise.all([
      toSpeechWav(Buffer.from(source, 'base64'), OWN_VOICE_MAX_SEC),
      toSpeechWav(Buffer.from(consent, 'base64'), OWN_VOICE_CONSENT_MAX_SEC),
    ])
    if (reading.durationSec < OWN_VOICE_MIN_SEC) {
      throw new AppError(`That reading was too short. Read the whole passage: it should take at least ${OWN_VOICE_MIN_SEC} seconds.`, 400, 'RECORDING_TOO_SHORT')
    }
    if (sentence.durationSec < OWN_VOICE_CONSENT_MIN_SEC) throw new AppError('That was too short for the consent sentence. Read all of it.', 400, 'RECORDING_TOO_SHORT')

    // Counted before Google is asked, so failed tries are limited too
    const period = currentPeriod()
    const before = owner.ownVoice
    const attempts = (before?.attemptsPeriod === period ? before.attempts : 0) + 1
    const row = await this.ownVoiceRepository.upsert(
      userId,
      { name: '', model: env.TTS_MODEL_MULTILINGUAL, attemptsPeriod: period, attempts },
      { attemptsPeriod: period, attempts },
    )

    let providerVoiceId: string
    try {
      providerVoiceId = mockCloning
        ? `mock_${row.id}_${row.version + 1}`
        : await createReplicatedVoice({ model: env.TTS_MODEL_MULTILINGUAL, displayName: `listenup-${row.id}`, sourceWav: reading.wav, consentWav: sentence.wav })
    } catch (e) {
      throw creationError(e)
    }

    const keys = recordingKeys(userId)
    await Promise.all([storage.put(keys.source, reading.wav, 'audio/wav'), storage.put(keys.consent, sentence.wav, 'audio/wav')])
    const now = new Date()
    await this.ownVoiceRepository.update(userId, {
      name: owner.name?.trim().split(/\s+/)[0] || 'My voice',
      providerVoiceId,
      model: env.TTS_MODEL_MULTILINGUAL,
      version: { increment: 1 },
      consentLanguage: language,
      consentedAt: now,
      sourceKey: keys.source,
      consentKey: keys.consent,
      providerCreatedAt: now,
    })
    // What the old recording made is of no use now
    if (before?.providerVoiceId) {
      const old = before.providerVoiceId
      if (!mockCloning) await deleteReplicatedVoice(old).catch((e) => console.error(`[own-voice] couldn't remove ${old} at Google`, e))
      await this.forgetAudio(userId, before)
    }
    return this.state(userId)
  }

  /** Forgets everything voiced with a voice: its samples, its clips, and the MP3s of the documents that had them */
  private async forgetAudio(userId: string, voice: OwnVoice) {
    if (!voice.providerVoiceId) return
    const ref = { id: voice.id, name: voice.name, model: voice.model, providerVoiceId: voice.providerVoiceId, version: voice.version }
    const documents = await this.ownVoiceRepository.documentsVoiced(userId)
    await Promise.all([
      this.ttsService.forgetPreviews(LANGS.map((lang) => ownVoiceIn(ref, lang))),
      this.ownVoiceRepository.forgetAudio(userId, documents),
      ...documents.map((id) => storage.deletePrefix(`exports/${id}`).catch(() => {})),
    ])
  }

  /**
   * Deletes the listener's voice for good: at Google, the two recordings, and
   * the audio made in it. Also run when an account is erased. Documents that
   * used it go back to the listener's usual voice for their language.
   */
  async remove(userId: string) {
    const voice = await this.ownVoiceRepository.find(userId)
    if (!voice?.providerVoiceId) return
    if (!mockCloning) {
      // While Google still has it the voice isn't deleted: say so, and let them try again
      await deleteReplicatedVoice(voice.providerVoiceId).catch((e) => {
        console.error(`[own-voice] couldn't remove ${voice.providerVoiceId} at Google`, e)
        throw new AppError('We couldn’t delete your voice just now. Try again in a moment.', 503, 'OWN_VOICE_UNAVAILABLE')
      })
    }
    await this.forgetAudio(userId, voice)
    await storage.deletePrefix(`own-voices/${userId}`)
    await this.ownVoiceRepository.clear(userId)
  }

  /** Daily: removes audio that finished being made just after its voice was deleted */
  async sweepStrayAudio() {
    return (await this.ownVoiceRepository.forgetStrayAudio()).count
  }

  /**
   * Google keeps a voice for a year. Before that, each is made again from its
   * saved recordings and the old one removed. Audio already made stays valid,
   * since it's filed under our id for the voice, not Google's.
   */
  async renewDue(limit = 20) {
    if (mockCloning || !env.GEMINI_API_KEY) return 0
    const due = await this.ownVoiceRepository.findMadeBefore(new Date(Date.now() - OWN_VOICE_RENEW_AFTER_DAYS * DAY_MS), limit)
    let renewed = 0
    for (const voice of due) {
      if (!voice.sourceKey || !voice.consentKey || !voice.providerVoiceId) continue
      try {
        const [sourceWav, consentWav] = await Promise.all([storage.get(voice.sourceKey), storage.get(voice.consentKey)])
        const providerVoiceId = await createReplicatedVoice({ model: voice.model, displayName: `listenup-${voice.id}`, sourceWav, consentWav })
        await this.ownVoiceRepository.update(voice.userId, { providerVoiceId, providerCreatedAt: new Date() })
        await deleteReplicatedVoice(voice.providerVoiceId).catch((e) => console.error(`[own-voice] couldn't remove the renewed ${voice.providerVoiceId} at Google`, e))
        renewed++
      } catch (e) {
        console.error(`[own-voice] couldn't renew voice ${voice.id}`, e)
      }
    }
    return renewed
  }
}
