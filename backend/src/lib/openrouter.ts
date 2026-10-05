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
  }).catch((e: unknown) => {
    // A provider that hangs shouldn't hold playback for minutes; say so plainly instead
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      console.error(`[openrouter] speech timed out after ${timeoutMs}ms (${req.model})`)
      throw new AppError('The voice service is slow right now. Try again in a moment.', 503, 'PROVIDER_TIMEOUT')
    }
    throw e
  })
  if (!res.ok) throw await failure(res, 'speech')
  return { audio: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') }
}

type ContentPart =
  | { type: 'text'; text: string }
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
}

/** Single-turn chat completion; returns the assistant text */
export async function chatCompletion(req: ChatRequest, timeoutMs = 120_000) {
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
    }),
  })
  if (!res.ok) throw await failure(res, req.purpose ?? 'text recognition')
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return body.choices?.[0]?.message?.content ?? ''
}
