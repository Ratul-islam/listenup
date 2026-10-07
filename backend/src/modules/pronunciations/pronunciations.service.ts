import { SIGNED_URL_TTL_SECONDS } from '../../config/constants.js'
import type { Pronunciation } from '../../generated/prisma/client.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { NO_EXPRESSIONS } from '../expressions/expression-catalog.js'
import { detectLanguage } from '../ingestion/text/language.js'
import type { TtsService } from '../tts/tts.service.js'
import { isServerVoice } from '../voices/voice-catalog.js'
import type { VoicesService } from '../voices/voices.service.js'
import { forgetLexicon } from './lexicon-cache.js'
import type { PronunciationsRepository } from './pronunciations.repository.js'
import { MAX_PRONUNCIATIONS, type PreviewBody, type PronunciationBody, type PronunciationUpdate } from './pronunciations.schema.js'

const toPublic = (p: Pronunciation) => ({ id: p.id, word: p.word, sayAs: p.sayAs, updatedAt: p.updatedAt })

/**
 * "Say it like this": the listener's spellings for names, brands and terms the
 * voices get wrong. They apply to every voice and every document of theirs, and
 * only the parts that contain a changed word are voiced again.
 */
export class PronunciationsService {
  constructor(
    private readonly pronunciationsRepository: PronunciationsRepository,
    private readonly voicesService: VoicesService,
    private readonly ttsService: TtsService,
  ) {}

  async list(userId: string) {
    return (await this.pronunciationsRepository.list(userId)).map(toPublic)
  }

  /** Adds a word, or changes how it's said if it's already there */
  async save(userId: string, { word, sayAs }: PronunciationBody) {
    const existing = await this.pronunciationsRepository.findWord(userId, word)
    if (!existing && (await this.pronunciationsRepository.count(userId)) >= MAX_PRONUNCIATIONS) {
      throw new AppError(`You can keep up to ${MAX_PRONUNCIATIONS} pronunciations. Remove some you no longer need.`, 400, 'TOO_MANY_PRONUNCIATIONS')
    }
    const saved = existing
      ? await this.pronunciationsRepository.update(existing.id, { word, sayAs })
      : await this.pronunciationsRepository.create(userId, word, sayAs).catch(async (e) => {
          // Saved twice at once
          if ((e as { code?: string }).code !== 'P2002') throw e
          return this.pronunciationsRepository.update((await this.pronunciationsRepository.findWord(userId, word))!.id, { sayAs })
        })
    forgetLexicon(userId)
    return toPublic(saved)
  }

  async update(userId: string, id: string, body: PronunciationUpdate) {
    const current = await this.pronunciationsRepository.findOwned(userId, id)
    if (!current) throw new AppError('Pronunciation not found', 404, 'PRONUNCIATION_NOT_FOUND')
    if (body.word && body.word.toLowerCase() !== current.word.toLowerCase()) {
      const clash = await this.pronunciationsRepository.findWord(userId, body.word)
      if (clash) throw new AppError(`"${clash.word}" already has a pronunciation`, 409, 'PRONUNCIATION_EXISTS')
    }
    const saved = await this.pronunciationsRepository.update(id, body)
    forgetLexicon(userId)
    return toPublic(saved)
  }

  async remove(userId: string, id: string) {
    const current = await this.pronunciationsRepository.findOwned(userId, id)
    if (!current) throw new AppError('Pronunciation not found', 404, 'PRONUNCIATION_NOT_FOUND')
    await this.pronunciationsRepository.delete(id)
    forgetLexicon(userId)
  }

  /**
   * "Hear it": the respelling in the voice that reads its language. A second or
   * two of audio, shared and cached like everything else. Phone voices say it
   * on the device instead.
   */
  async preview(userId: string, { sayAs, language, voiceId }: PreviewBody) {
    const prefs = await this.voicesService.getPreferences(userId)
    const lang = language ?? detectLanguage(sayAs)
    const voice = this.voicesService.resolve(voiceId, lang, prefs)
    if (!isServerVoice(voice)) throw new AppError('Phone voices say it on the device.', 400, 'PHONE_VOICE')
    const blob = await this.ttsService.voiceText(userId, sayAs, NO_EXPRESSIONS, voice)
    return { url: await storage.signedUrl(blob.storageKey, SIGNED_URL_TTL_SECONDS), voiceId: voice.id, mimeType: blob.mimeType }
  }
}
