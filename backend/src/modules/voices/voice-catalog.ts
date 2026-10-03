import { env } from '../../config/env.js'
import type { Lang } from '../ingestion/text/language.js'

export interface VoiceDefinition {
  id: string
  name: string
  language: Lang
  accent: string
  style: string
  gender: 'female' | 'male'
  /** Shown as a badge ("HD NEURAL") */
  quality: 'standard' | 'hd'
  model: string
  providerVoice: string
  /** Can take emotions and sounds (Gemini); Kokoro voices read everything plainly */
  expressive: boolean
  /** Accent direction appended to every delivery style, e.g. "in a British English accent" */
  accentStyle?: string
}

const standard = env.TTS_MODEL_STANDARD
const multilingual = env.TTS_MODEL_MULTILINGUAL

const american = 'in an American English accent'
const british = 'in a British English accent'

/**
 * Built-in voices. Each maps to an OpenRouter model + provider voice, so the
 * mapping can change without touching clients.
 *
 * Chosen by testing (Oct 2026), with speech-to-text and an audio model as judge.
 * Gemini Flash Lite TTS speaks Bangla well and takes emotions, so most voices use
 * it; its accent follows the style direction for American and British English.
 * Indian English held only about a third of the time, so the Indian voices stay
 * on Kokoro (cheapest, word-perfect, but no emotions). Bangla voices are
 * distinguished by voice, not accent.
 */
export const VOICES: VoiceDefinition[] = [
  { id: 'nova', name: 'Nova', language: 'en', accent: 'American', style: 'Warm & natural', gender: 'female', quality: 'hd', model: multilingual, providerVoice: 'Sulafat', expressive: true, accentStyle: american },
  { id: 'breeze', name: 'Breeze', language: 'en', accent: 'American', style: 'Bright & upbeat', gender: 'female', quality: 'hd', model: multilingual, providerVoice: 'Zephyr', expressive: true, accentStyle: american },
  { id: 'atlas', name: 'Atlas', language: 'en', accent: 'American', style: 'Deep & steady', gender: 'male', quality: 'hd', model: multilingual, providerVoice: 'Alnilam', expressive: true, accentStyle: american },
  { id: 'eleanor', name: 'Eleanor', language: 'en', accent: 'British', style: 'Warm studio', gender: 'female', quality: 'hd', model: multilingual, providerVoice: 'Despina', expressive: true, accentStyle: british },
  { id: 'oliver', name: 'Oliver', language: 'en', accent: 'British', style: 'Calm narrator', gender: 'male', quality: 'hd', model: multilingual, providerVoice: 'Schedar', expressive: true, accentStyle: british },
  { id: 'arjun', name: 'Arjun', language: 'en', accent: 'Indian', style: 'Clear & friendly', gender: 'male', quality: 'standard', model: standard, providerVoice: 'hm_omega', expressive: false },
  { id: 'maya', name: 'Maya', language: 'en', accent: 'Indian', style: 'Soft & warm', gender: 'female', quality: 'standard', model: standard, providerVoice: 'hf_beta', expressive: false },
  { id: 'nusrat', name: 'Nusrat', language: 'bn', accent: 'Bangla', style: 'Soft & clear', gender: 'female', quality: 'hd', model: multilingual, providerVoice: 'Kore', expressive: true },
  { id: 'rafi', name: 'Rafi', language: 'bn', accent: 'Bangla', style: 'Warm storyteller', gender: 'male', quality: 'hd', model: multilingual, providerVoice: 'Charon', expressive: true },
  { id: 'tanisha', name: 'Tanisha', language: 'bn', accent: 'Bangla', style: 'Bright & expressive', gender: 'female', quality: 'hd', model: multilingual, providerVoice: 'Aoede', expressive: true },
]

export const DEFAULT_VOICE: Record<Lang, string> = { en: 'nova', bn: 'nusrat' }

const byId = new Map(VOICES.map((v) => [v.id, v]))

export const findVoice = (id: string | null | undefined) => (id ? byId.get(id) : undefined)

export const PREVIEW_TEXT: Record<Lang, string> = {
  en: "Hi, I'm here to read your articles, notes and books aloud, whenever you're ready.",
  bn: 'আমি আপনার লেখা, নোট আর বই পড়ে শোনাতে প্রস্তুত। যখন খুশি শুরু করুন।',
}
