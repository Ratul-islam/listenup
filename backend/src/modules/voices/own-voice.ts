import { AppError } from '../../utils/AppError.js'
import { LANGS, type Lang } from '../ingestion/text/language.js'
import { VOICES, type VoiceDefinition } from './voice-catalog.js'

/** A listener's own voice, as far as voicing needs to know it */
export interface OwnVoiceRef {
  id: string
  name: string
  model: string
  /** Google's id for it */
  providerVoiceId: string
  version: number
}

// One voice id per language ("mine-bn"), so it's chosen per language like any other voice
const PREFIX = 'mine-'

export const ownVoiceId = (language: Lang) => `${PREFIX}${language}`

/** The language an own-voice id reads, or null for any other id */
export function ownVoiceLanguage(id: string | null | undefined): Lang | null {
  if (!id?.startsWith(PREFIX)) return null
  const language = id.slice(PREFIX.length) as Lang
  return LANGS.includes(language) ? language : null
}

/**
 * A listener's own voice reading one language. It's an Expressive voice: the
 * same model makes it, so it takes emotions and uses Expressive minutes.
 * English is read in the speaker's own accent; other languages get the
 * direction their built-in voices have, which keeps the model in that language.
 */
export function ownVoiceIn(own: OwnVoiceRef, language: Lang): VoiceDefinition {
  return {
    id: ownVoiceId(language),
    name: own.name,
    language,
    accent: 'Your voice',
    style: 'Recorded by you',
    gender: 'varies',
    tier: 'expressive',
    model: own.model,
    providerVoice: own.providerVoiceId,
    expressive: true,
    accentStyle: language === 'en' ? undefined : VOICES.find((v) => v.language === language && v.expressive)?.accentStyle,
    own: true,
    cacheKey: `own:${own.id}:${own.version}`,
  }
}

/** Explore is public, and a listener's own voice is for their ears and their own files */
export const ownVoiceIsPrivate = () => new AppError('Your own voice stays private to you. Pick one of ListenUp’s voices to publish with.', 400, 'OWN_VOICE_PRIVATE')
