import { LANGS, type Lang } from '../ingestion/text/language.js'
import { VOICES, type VoiceDefinition } from './voice-catalog.js'

/** The voice of the speaker in a recording sent for voice translation, as far as voicing needs to know it */
export interface SpeakerVoiceRef {
  id: string
  documentId: string
  model: string
  /** Google's key for it ("voicekey_…"), renewed every week */
  providerVoiceId: string
  version: number
  /** The translation's title, to tell one speaker from another */
  title: string
}

// "speaker-bn-<id>": chosen per language like any other voice
const PATTERN = /^speaker-([a-z]{2})-([0-9a-f-]{36})$/

export const speakerVoiceId = (id: string, language: Lang) => `speaker-${language}-${id}`

/** The speaker voice and language an id names, or null for any other id */
export function parseSpeakerVoiceId(id: string | null | undefined): { id: string; language: Lang } | null {
  const match = id ? PATTERN.exec(id) : null
  if (!match || !LANGS.includes(match[1] as Lang)) return null
  return { id: match[2], language: match[1] as Lang }
}

/**
 * A speaker's voice reading one language: an Expressive voice like the
 * listener's own (the same model makes it, through Google only, and its
 * audio is never shared), offered only in the translation it was made for.
 */
export function speakerVoiceIn(ref: SpeakerVoiceRef, language: Lang): VoiceDefinition {
  return {
    id: speakerVoiceId(ref.id, language),
    name: 'Speaker’s voice',
    language,
    accent: 'From the recording',
    style: ref.title,
    gender: 'varies',
    tier: 'expressive',
    model: ref.model,
    providerVoice: ref.providerVoiceId,
    expressive: true,
    accentStyle: language === 'en' ? undefined : VOICES.find((v) => v.language === language && v.expressive)?.accentStyle,
    own: true,
    cacheKey: `speaker:${ref.id}:${ref.version}`,
    forDocument: ref.documentId,
  }
}
