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
  // Vertex is Google's list price too, whether paid in cash or with Cloud credits
  return route === 'google' || route === 'vertex' ? usd : usd * (1 + OPENROUTER_FEE)
}

// Text models, USD per million tokens (OpenRouter list prices). Used when OpenRouter doesn't
// report a request's cost, and to estimate one before it's sent
const TEXT_PRICES: Record<string, { input: number; output: number }> = {
  'google/gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'google/gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'google/gemini-3.8-flash': { input: 0.75, output: 3.75 },
}
// Unknown text models err high
const TEXT_FALLBACK = { input: 1, output: 5 }

/** Estimated USD for a text request, including OpenRouter's fee on credits */
export function textCostUsd(model: string, promptTokens: number, completionTokens: number) {
  const price = TEXT_PRICES[model] ?? TEXT_FALLBACK
  return ((promptTokens * price.input + completionTokens * price.output) / 1e6) * (1 + OPENROUTER_FEE)
}

/** What OpenRouter reported a request cost, plus its fee on credits */
export const withOpenRouterFee = (usd: number) => usd * (1 + OPENROUTER_FEE)

/** Rough tokens in a request before it's sent: its text, plus a page's worth for each image or file */
export const promptTokensOf = (textChars: number, attachments: number) => Math.round(textChars / CHARS_PER_TOKEN) + attachments * 1500
