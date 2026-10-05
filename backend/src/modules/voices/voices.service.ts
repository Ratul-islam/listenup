import { AppError } from '../../utils/AppError.js'
import { LANGS, type Lang } from '../ingestion/text/language.js'
import { DEFAULT_VOICE, findVoice, isServerVoice, VOICES, type ServerTier, type VoiceDefinition } from './voice-catalog.js'
import type { VoicesRepository } from './voices.repository.js'
import type { PreferencesBody } from './voices.schema.js'

export interface Preferences {
  /** Preferred voice for every language */
  voices: Record<Lang, string>
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
    tier: v.tier,
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
    const saved = (pref?.voices ?? {}) as Partial<Record<Lang, string>>
    const voices = Object.fromEntries(
      LANGS.map((lang) => {
        const voice = findVoice(saved[lang])
        return [lang, voice?.language === lang ? voice.id : DEFAULT_VOICE[lang]]
      }),
    ) as Record<Lang, string>
    return {
      voices,
      speed: pref?.speed ?? 1,
      dailyGoalMinutes: pref?.dailyGoalMinutes ?? 30,
      autoPlayNext: pref?.autoPlayNext ?? true,
    }
  }

  async updatePreferences(userId: string, { voices, ...rest }: PreferencesBody) {
    for (const [lang, id] of Object.entries(voices ?? {})) {
      if (findVoice(id)?.language !== lang) throw new AppError(`"${id}" is not a voice for that language`, 400, 'INVALID_VOICE')
    }
    const current = voices ? ((await this.voicesRepository.findPreference(userId))?.voices ?? {}) : undefined
    await this.voicesRepository.upsertPreference(userId, {
      ...rest,
      ...(voices && { voices: { ...(current as object), ...voices } }),
    })
    return this.getPreferences(userId)
  }

  /**
   * Voice for a chunk: the listener's chosen voice when it speaks the chunk's
   * language, otherwise their preferred voice for that language.
   */
  resolve(chosenVoiceId: string | null | undefined, language: Lang, prefs: Preferences): VoiceDefinition {
    const chosen = findVoice(chosenVoiceId)
    if (chosen?.language === language) return chosen
    return findVoice(prefs.voices[language]) ?? findVoice(DEFAULT_VOICE[language])!
  }

  /** Like resolve(), but never a phone voice, which only the app can voice (e.g. for MP3 export) */
  resolveServer(chosenVoiceId: string | null | undefined, language: Lang, prefs: Preferences): VoiceDefinition & { tier: ServerTier } {
    const voice = this.resolve(chosenVoiceId, language, prefs)
    if (isServerVoice(voice)) return voice
    const fallback = findVoice(DEFAULT_VOICE[language])!
    if (!isServerVoice(fallback)) throw new Error(`Default ${language} voice must be voiced on the server`)
    return fallback
  }
}
