/**
 * Estimated cost of speech, for the daily spending caps. Prices are Google's and
 * Kokoro hosts' list prices; through OpenRouter add its 5.5% fee on buying
 * credits, and Google's flex tier is half price. Update them here when a
 * provider changes its prices.
 */

import type { SpeechRoute } from '../modules/tts/providers/tts-provider.js'
import { env } from './env.js'

const OPENROUTER_FEE = 0.055
// Google's flex tier (and Batch) bills half the standard rate
const FLEX_DISCOUNT = 0.5
// Gemini bills audio at 25 tokens per second of speech
const GEMINI_AUDIO_TOKENS_PER_SEC = 25
// Rough text tokens per character across English and Bangla
const CHARS_PER_TOKEN = 3
// Google's introductory Gemini TTS prices end on this day and every rate doubles
const GEMINI_PRICE_DOUBLES_AT = Date.UTC(2027, 0, 1)

interface ModelPrice {
  /** USD per million input characters (character-priced models) */
  perMillionChars?: number
  /** USD per million text input tokens (token-priced models) */
  perMillionInputTokens?: number
  /** USD per million audio output tokens (token-priced models) */
  perMillionAudioTokens?: number
  /** Whether Google's 2027 doubling applies */
  geminiIntro?: boolean
}

const PRICES: Record<string, ModelPrice> = {
  'hexgrad/kokoro-82m': { perMillionChars: 0.62 },
  'google/gemini-3.8-flash-lite-tts': { perMillionInputTokens: 0.5, perMillionAudioTokens: 6, geminiIntro: true },
  'google/gemini-3.8-flash-tts': { perMillionInputTokens: 0.5, perMillionAudioTokens: 9, geminiIntro: true },
}

// Unknown models are priced like the premium character-priced voices, to err high
const FALLBACK: ModelPrice = { perMillionChars: 15 }

/**
 * Estimated USD for voicing `chars` characters into `seconds` of audio with
 * `model`, made through `route`. Without a route (estimates before voicing),
 * it assumes OpenRouter, the dearest.
 */
export function speechCostUsd(model: string, chars: number, seconds: number, { at = Date.now(), route }: { at?: number; route?: SpeechRoute } = {}) {
  // Kokoro on your own server is a fixed monthly cost, not per use
  if (route === 'local' || (!route && env.KOKORO_URL && /kokoro/i.test(model))) return 0
  const price = PRICES[model] ?? FALLBACK
  const factor = price.geminiIntro && at >= GEMINI_PRICE_DOUBLES_AT ? 2 : 1
  let usd = 0
  if (price.perMillionChars) usd += (chars / 1e6) * price.perMillionChars
  if (price.perMillionInputTokens) usd += (chars / CHARS_PER_TOKEN / 1e6) * price.perMillionInputTokens * factor
  if (price.perMillionAudioTokens) usd += ((seconds * GEMINI_AUDIO_TOKENS_PER_SEC) / 1e6) * price.perMillionAudioTokens * factor
  if (route === 'google-flex') return usd * FLEX_DISCOUNT
  return route === 'google' ? usd : usd * (1 + OPENROUTER_FEE)
}
