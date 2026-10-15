import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

const BASE_URL = 'https://openrouter.ai/api/v1'

function headers(extra: Record<string, string> = {}) {
  if (!env.OPENROUTER_API_KEY) {
    throw new AppError('Speech service is not configured', 503, 'PROVIDER_NOT_CONFIGURED')
  }
  return {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    'HTTP-Referer': env.PUBLIC_URL,
    'X-Title': 'ListenUp',
    ...extra,
  }
}

async function failure(res: Response, what: string) {
  const body = await res.text().catch(() => '')
  console.error(`[openrouter] ${what} failed (${res.status}): ${body.slice(0, 500)}`)
  const status = res.status === 429 ? 503 : 502
  return new AppError(`The ${what} service is unavailable right now. Try again shortly.`, status, 'PROVIDER_ERROR')
}

export interface SpeechRequest {
  model: string
  input: string
  voice?: string
  /** Delivery direction ("sad and tearful, in a British English accent") */
  style?: string
  speed?: number
  responseFormat?: 'mp3' | 'pcm'
  /** Reference audio for voice cloning, as data URLs */
  inputReferences?: string[]
  /** Only this OpenRouter provider (e.g. "Together"), with no fallback to others */
  onlyProvider?: string
}

/**
 * Style goes in provider-specific options: Gemini reads speech_metadata.style
 * (OpenRouter drops a top-level `instructions` for it), OpenAI reads
 * instructions. Options for providers that don't serve the request are ignored.
 */
const styleOptions = (style: string) => ({
  'google-ai-studio': { speech_metadata: { style } },
  'google-vertex': { speech_metadata: { style } },
  openai: { instructions: style },
})

/** POST /audio/speech (OpenAI-compatible); returns the audio and its content type */
export async function createSpeech(req: SpeechRequest, timeoutMs = 60_000) {
  // A provider that hangs shouldn't hold playback for minutes; say so plainly instead
  const slow = (e: unknown): never => {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      console.error(`[openrouter] speech timed out after ${timeoutMs}ms (${req.model})`)
      throw new AppError('The voice service is slow right now. Try again in a moment.', 503, 'PROVIDER_TIMEOUT')
    }
    throw e
  }
  const res = await fetch(`${BASE_URL}/audio/speech`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: req.model,
      input: req.input,
      voice: req.voice,
      speed: req.speed ?? 1,
      response_format: req.responseFormat ?? 'mp3',
      input_references: req.inputReferences,
      ...((req.style || req.onlyProvider) && {
        provider: {
          ...(req.style && { options: styleOptions(req.style) }),
          ...(req.onlyProvider && { order: [req.onlyProvider], allow_fallbacks: false }),
        },
      }),
    }),
  }).catch(slow)
  if (!res.ok) throw await failure(res, 'speech')
  // The timeout also covers reading the audio, which some hosts start and then stall on
  return { audio: Buffer.from(await res.arrayBuffer().catch(slow)), contentType: res.headers.get('content-type') }
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'input_audio'; input_audio: { data: string; format: 'mp3' | 'wav' } }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

export interface ChatRequest {
  model: string
  system?: string
  content: ContentPart[]
  maxTokens?: number
  /** PDF parsing engine when sending files */
  pdfEngine?: 'native' | 'mistral-ocr' | 'cloudflare-ai'
  /** Ask for a JSON object reply */
  json?: boolean
  /** Names the service in error messages */
  purpose?: string
  /** How much the model may think first (models that can't, ignore it); thinking is billed as output */
  reasoning?: 'low' | 'medium' | 'high'
  /** Whose request it is: its cost counts in their share of the daily spending caps (free or paid). Leave out for the app's own */
  userId?: string | null
}

/** What one text request used, from OpenRouter's usage report */
export interface ChatUsage {
  promptTokens: number
  completionTokens: number
  /** OpenRouter's own figure in USD, when it sends one */
  costUsd: number | null
}

/** Keeps text-AI spending inside the daily caps; the usage module provides it */
export interface TextSpendGuard {
  /** Before a request: throws when today's cap is spent. What it returns is handed to `after`. */
  before(req: ChatRequest): Promise<unknown>
  /** After a request: records what it cost */
  after(req: ChatRequest, usage: ChatUsage, token: unknown): Promise<void>
}

let spendGuard: TextSpendGuard | null = null

/** Every chat completion from now on is checked against, and counted in, the daily caps */
export function setTextSpendGuard(guard: TextSpendGuard) {
  spendGuard = guard
}

/** Single-turn chat completion; returns the assistant text. Its cost counts toward the daily caps. */
export async function chatCompletion(req: ChatRequest, timeoutMs = 120_000) {
  const token = await spendGuard?.before(req)
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: 0,
      messages: [
        ...(req.system ? [{ role: 'system', content: req.system }] : []),
        { role: 'user', content: req.content },
      ],
      ...(req.pdfEngine && { plugins: [{ id: 'file-parser', pdf: { engine: req.pdfEngine } }] }),
      ...(req.json && { response_format: { type: 'json_object' } }),
      ...(req.reasoning && { reasoning: { effort: req.reasoning, exclude: true } }),
      // Ask for what it cost, for the daily caps
      usage: { include: true },
    }),
  })
  if (!res.ok) throw await failure(res, req.purpose ?? 'text recognition')
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  }
  if (spendGuard) {
    const usage = {
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
      costUsd: typeof body.usage?.cost === 'number' ? body.usage.cost : null,
    }
    await spendGuard.after(req, usage, token).catch((e) => console.warn('[openrouter] text spend not recorded', e))
  }
  return body.choices?.[0]?.message?.content ?? ''
}
