import type { Gender } from '../expressions/expression-catalog.js'
import { findVoice, isServerVoice, VOICES, type VoiceDefinition } from './voice-catalog.js'

/** What decides a character's voice */
export interface CastChoice {
  gender?: Gender
  /** Their place among the story's characters of the same gender */
  rank: number
  /** The listener's own pick */
  voiceId?: string
}

/**
 * A voice as it reads beside this narrator. Expressive voices speak any
 * language and take their accent from the direction, so a character sounds
 * like they belong in the narrator's story: the narrator's language and accent
 * (without this, an American narrator's Bangla story got a British character).
 * Natural voices only read their own language, in the accent they're made with.
 */
const borrowed = (voice: VoiceDefinition, narrator: VoiceDefinition): VoiceDefinition =>
  voice.expressive ? { ...voice, language: narrator.language, accentStyle: narrator.accentStyle } : voice

/**
 * The voices a character can be given beside this narrator: the same level,
 * so a story never uses another kind of minutes than its narrator does, and
 * never the narrator's own. Voices of the story's language come first (the
 * narrator's accent before others). Expressive voices from other languages
 * follow, for stories with more characters than the language has voices;
 * Natural voices only speak their own language.
 */
export function castPool(narrator: VoiceDefinition, gender?: Gender): VoiceDefinition[] {
  if (!isServerVoice(narrator)) return []
  const fits = (v: VoiceDefinition) => v.tier === narrator.tier && v.providerVoice !== narrator.providerVoice && (!gender || v.gender === gender)
  const own = VOICES.filter((v) => v.language === narrator.language && fits(v))
  const sameAccent = own.filter((v) => v.accent === narrator.accent)
  const others = narrator.expressive ? VOICES.filter((v) => v.language !== narrator.language && fits(v)) : []
  return [...sameAccent, ...own.filter((v) => v.accent !== narrator.accent), ...others].map((v) => borrowed(v, narrator))
}

/** Whether the listener's pick for a character can be used beside this narrator */
const usable = (voice: VoiceDefinition | undefined, narrator: VoiceDefinition): voice is VoiceDefinition =>
  !!voice && voice.tier === narrator.tier && voice.providerVoice !== narrator.providerVoice && (voice.language === narrator.language || narrator.expressive)

/**
 * The voice that reads a character's lines when `narrator` reads the story:
 * the listener's pick if it fits, otherwise one of their gender, a different
 * one for each character while there are enough. It depends only on the
 * character and the narrator, so a character sounds the same in every part,
 * and changing the narrator recasts everyone to match its level. The
 * narrator's own voice when there's nobody else to give them.
 */
export function castVoice(character: CastChoice, narrator: VoiceDefinition): VoiceDefinition {
  if (!isServerVoice(narrator)) return narrator
  const chosen = findVoice(character.voiceId)
  if (usable(chosen, narrator)) return borrowed(chosen, narrator)
  const pool = castPool(narrator, character.gender)
  return pool.length ? pool[character.rank % pool.length] : narrator
}

/** True when the listener's pick is the voice in use (not ignored for not fitting the narrator) */
export const isChosen = (character: CastChoice, narrator: VoiceDefinition) => usable(findVoice(character.voiceId), narrator)
