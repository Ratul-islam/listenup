import { AppError } from '../../utils/AppError.js'
import type { Lang } from '../ingestion/text/language.js'
import { DEFAULT_VOICE, findVoice, VOICES, type VoiceDefinition } from './voice-catalog.js'
import type { VoicesRepository } from './voices.repository.js'
import type { PreferencesBody } from './voices.schema.js'

export interface Preferences {
  voiceEnId: string
  voiceBnId: string
  speed: number
  dailyGoalMinutes: number
  autoPlayNext: boolean
}

/** Public shape of a voice (no provider details) */
export function toPublicVoice(v: VoiceDefinition) {
  return {
    id: v.id,
    name: v.name,
    language: v.language,
    accent: v.accent,
    style: v.style,
    gender: v.gender,
    quality: v.quality,
    expressive: v.expressive,
  }
}

export class VoicesService {
  constructor(private readonly voicesRepository: VoicesRepository) {}

  list() {
    return VOICES.map(toPublicVoice)
  }

  async getPreferences(userId: string): Promise<Preferences> {
    const pref = await this.voicesRepository.findPreference(userId)
    return {
      voiceEnId: findVoice(pref?.voiceEnId)?.id ?? DEFAULT_VOICE.en,
      voiceBnId: findVoice(pref?.voiceBnId)?.id ?? DEFAULT_VOICE.bn,
      speed: pref?.speed ?? 1,
      dailyGoalMinutes: pref?.dailyGoalMinutes ?? 30,
      autoPlayNext: pref?.autoPlayNext ?? true,
    }
  }

  async updatePreferences(userId: string, body: PreferencesBody) {
    for (const [field, lang] of [['voiceEnId', 'en'], ['voiceBnId', 'bn']] as const) {
      const id = body[field]
      if (id !== undefined && findVoice(id)?.language !== lang) {
        throw new AppError(`"${id}" is not a ${lang === 'en' ? 'English' : 'Bangla'} voice`, 400, 'INVALID_VOICE')
      }
    }
    await this.voicesRepository.upsertPreference(userId, body)
    return this.getPreferences(userId)
  }

  /**
   * Voice for a chunk: the listener's chosen voice when it speaks the chunk's
   * language, otherwise their preferred voice for that language.
   */
  resolve(chosenVoiceId: string | null | undefined, language: Lang, prefs: Preferences): VoiceDefinition {
    const chosen = findVoice(chosenVoiceId)
    if (chosen?.language === language) return chosen
    return findVoice(language === 'bn' ? prefs.voiceBnId : prefs.voiceEnId) ?? findVoice(DEFAULT_VOICE[language])!
  }
}
