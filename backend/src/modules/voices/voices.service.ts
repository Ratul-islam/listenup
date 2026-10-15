import { AppError } from '../../utils/AppError.js'
import { LANGS, type Lang } from '../ingestion/text/language.js'
import { OWN_VOICE_PLAN, planAtLeast } from '../plans/plan-catalog.js'
import { freshSpeakerVoices } from '../voice-translation/speaker-keys.js'
import { ownVoiceIn, ownVoiceLanguage, type OwnVoiceRef } from './own-voice.js'
import { parseSpeakerVoiceId, speakerVoiceIn, type SpeakerVoiceRef } from './speaker-voice.js'
import { DEFAULT_VOICE, deviceVoiceOf, findVoice, isServerVoice, VOICES, type ServerTier, type VoiceDefinition } from './voice-catalog.js'
import type { VoicesRepository } from './voices.repository.js'
import type { PreferencesBody } from './voices.schema.js'

export interface Preferences {
  /** Preferred voice for every language */
  voices: Record<Lang, string>
  speed: number
  dailyGoalMinutes: number
  autoPlayNext: boolean
}

/** A listener's preferences as the server uses them: with their own voice, when their plan includes it now */
export interface ListenerPreferences extends Preferences {
  own: OwnVoiceRef | null
  /** Speakers' voices cloned for the listener's voice translations (Pro) */
  speakers: SpeakerVoiceRef[]
  /**
   * The document being voiced. A speaker's voice reads only the translation it
   * was made for, so it's found only when this is that document: never in a
   * voice note, a pronunciation preview, Explore or another document.
   */
  documentId?: string
}

/** The preferences the app is sent (nothing about the own voice's provider) */
export const toPublicPreferences = ({ own: _own, speakers: _speakers, documentId: _documentId, ...preferences }: ListenerPreferences): Preferences => preferences

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
    /** Kokoro speaker for voicing it on the phone once the on-device package is downloaded */
    deviceVoice: deviceVoiceOf(v),
    /** The listener's own cloned voice */
    own: !!v.own,
    /** A speaker's voice from a voice translation: offered only in that document */
    forDocument: v.forDocument ?? null,
  }
}

/** A document's language when it's mostly in one (not "mixed"): the language its narrator speaks */
export const mainLanguage = (language: string | null | undefined): Lang | null => (LANGS.includes(language as Lang) ? (language as Lang) : null)

/**
 * Whether a voice can read a passage in a language that isn't its own.
 * Expressive voices are multilingual. Natural voices speak one language, with
 * one exception: the Hindi ones read English too (they're the Indian English
 * voices, Arjun and Maya, under other names).
 */
const readsAlso = (voice: VoiceDefinition, language: Lang) => voice.expressive || (voice.tier === 'natural' && voice.language === 'hi' && language === 'en')

/**
 * A narrator as it reads a passage in another language. English is read the
 * narrator's own way (its accent direction stays). Another language is read
 * as that language's voices are directed, not in the narrator's accent.
 */
function reading(narrator: VoiceDefinition, language: Lang): VoiceDefinition {
  if (!narrator.expressive || language === 'en') return { ...narrator, language }
  return { ...narrator, language, accentStyle: VOICES.find((v) => v.language === language && v.expressive)?.accentStyle }
}

export class VoicesService {
  constructor(private readonly voicesRepository: VoicesRepository) {}

  /** Every voice a listener can choose: the built-in ones and, first in each language, their own */
  list(prefs: ListenerPreferences) {
    const own = prefs.own
    // A speaker's voice reads every language, like the listener's own (the app offers it only in its translation)
    const speakers = prefs.speakers.flatMap((s) => LANGS.map((lang) => speakerVoiceIn(s, lang)))
    return [...(own ? LANGS.map((lang) => ownVoiceIn(own, lang)) : []), ...speakers, ...VOICES].map(toPublicVoice)
  }

  /**
   * A voice by id: a built-in one, or the listener's own ("mine-bn") while
   * their plan includes it. Without it, an own-voice id is unknown, and
   * whatever chose it falls back as it does for any voice that's gone.
   */
  find(id: string | null | undefined, prefs: ListenerPreferences): VoiceDefinition | undefined {
    const language = ownVoiceLanguage(id)
    if (language) return prefs.own ? ownVoiceIn(prefs.own, language) : undefined
    const speaker = parseSpeakerVoiceId(id)
    if (speaker) {
      const ref = prefs.speakers.find((s) => s.id === speaker.id && s.documentId === prefs.documentId)
      return ref ? speakerVoiceIn(ref, speaker.language) : undefined
    }
    return findVoice(id)
  }

  /** The same preferences, voicing `documentId` (where its speaker's voice, if any, can read) */
  forDocument(prefs: ListenerPreferences, documentId: string): ListenerPreferences {
    return { ...prefs, documentId }
  }

  /**
   * A voice for its sample sentence. The sentence is always the same, so a
   * speaker's voice may say it outside its translation (the voice sheet plays it).
   */
  findForPreview(id: string, prefs: ListenerPreferences): VoiceDefinition | undefined {
    const speaker = parseSpeakerVoiceId(id)
    const documentId = speaker ? prefs.speakers.find((s) => s.id === speaker.id)?.documentId : undefined
    return this.find(id, documentId ? this.forDocument(prefs, documentId) : prefs)
  }

  /** `documentId`: the document being voiced, if any (see ListenerPreferences.documentId) */
  async getPreferences(userId: string, documentId?: string): Promise<ListenerPreferences> {
    const listener = await this.voicesRepository.findListener(userId)
    const pref = listener?.preference
    const made = listener?.ownVoice
    // A voice kept after Pro ends stays saved, but reads nothing until Pro is back
    const own = made?.providerVoiceId && planAtLeast(listener?.plan, OWN_VOICE_PLAN) ? { id: made.id, name: made.name, model: made.model, providerVoiceId: made.providerVoiceId, version: made.version } : null
    // Speakers' voices read only while the plan includes them, like the listener's own
    const speakers = planAtLeast(listener?.plan, OWN_VOICE_PLAN) && listener?.speakerVoices.length ? await freshSpeakerVoices(listener.speakerVoices) : []
    const saved = (pref?.voices ?? {}) as Partial<Record<Lang, string>>
    const voices = Object.fromEntries(
      LANGS.map((lang) => {
        const voice = ownVoiceLanguage(saved[lang]) ? (own ? ownVoiceIn(own, lang) : undefined) : findVoice(saved[lang])
        return [lang, voice?.language === lang ? voice.id : DEFAULT_VOICE[lang]]
      }),
    ) as Record<Lang, string>
    return {
      voices,
      speed: pref?.speed ?? 1,
      dailyGoalMinutes: pref?.dailyGoalMinutes ?? 30,
      autoPlayNext: pref?.autoPlayNext ?? true,
      own,
      speakers,
      documentId,
    }
  }

  async updatePreferences(userId: string, { voices, ...rest }: PreferencesBody) {
    if (voices) {
      const prefs = await this.getPreferences(userId)
      for (const [lang, id] of Object.entries(voices)) {
        if (this.find(id, prefs)?.language !== lang) throw new AppError(`"${id}" is not a voice for that language`, 400, 'INVALID_VOICE')
      }
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
   *
   * `main` is the document's language when it's mostly in one. Its voice is
   * the narrator, and also reads the passages in another language when it can
   * (see readsAlso), so a Bangla story with an English paragraph keeps one
   * reader instead of an English voice cutting in. A voice the listener chose
   * for that other language still wins.
   */
  resolve(chosenVoiceId: string | null | undefined, language: Lang, prefs: ListenerPreferences, main?: Lang | null): VoiceDefinition {
    const chosen = this.find(chosenVoiceId, prefs)
    if (chosen?.language === language) return chosen
    const preferred = this.find(prefs.voices[language], prefs) ?? findVoice(DEFAULT_VOICE[language])!
    if (!main || main === language) return preferred
    const narrator = chosen?.language === main ? chosen : (this.find(prefs.voices[main], prefs) ?? findVoice(DEFAULT_VOICE[main])!)
    return readsAlso(narrator, language) ? reading(narrator, language) : preferred
  }

  /**
   * A part's voice: its own (a character's voice, or the one it was locked
   * with) when that voice speaks the part's language, otherwise `fallback`,
   * the document's voice for the language. With `prefs`, a part's own voice
   * can be the listener's own; without (a published writing, which every
   * listener hears the same), only built-in voices count.
   */
  forPart<V extends VoiceDefinition>(part: { voiceId: string | null; language: string }, fallback: V, prefs?: ListenerPreferences): V | VoiceDefinition {
    const own = prefs ? this.find(part.voiceId, prefs) : findVoice(part.voiceId)
    return own?.language === part.language ? own : fallback
  }

  /** Like forPart(), but never a phone voice (MP3 exports) */
  forPartServer(part: { voiceId: string | null; language: string }, fallback: VoiceDefinition & { tier: ServerTier }, prefs?: ListenerPreferences) {
    const voice = this.forPart(part, fallback, prefs)
    return isServerVoice(voice) ? voice : fallback
  }

  /** Like resolve(), but never a phone voice, which only the app can voice (e.g. for MP3 export) */
  resolveServer(chosenVoiceId: string | null | undefined, language: Lang, prefs: ListenerPreferences, main?: Lang | null): VoiceDefinition & { tier: ServerTier } {
    const voice = this.resolve(chosenVoiceId, language, prefs, main)
    if (isServerVoice(voice)) return voice
    const fallback = findVoice(DEFAULT_VOICE[language])!
    if (!isServerVoice(fallback)) throw new Error(`Default ${language} voice must be voiced on the server`)
    return fallback
  }
}
