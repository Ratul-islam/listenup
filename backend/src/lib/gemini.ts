import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

export type GeminiTier = 'standard' | 'flex'

export interface GeminiSpeechRequest {
  /** OpenRouter-style id ("google/gemini-3.8-flash-lite-tts") or Google's own */
  model: string
  text: string
  /** Prebuilt voice ("Sulafat") */
  voice: string
  /** Delivery direction, sent as speech metadata rather than spoken */
  style?: string
  tier: GeminiTier
  timeoutMs: number
}

export interface GeminiSpeech {
  /** 16-bit little-endian mono PCM */
  pcm: Buffer
  sampleRate: number
  /** The tier Google says served it (billing follows this, not what was asked for) */
  tier: string
}

interface InteractionResponse {
  service_tier?: string
  steps?: { type?: string; content?: { type?: string; data?: string; mime_type?: string }[] }[]
}

/** Raw PCM and its rate from a WAV file (Google's default) or headerless L16 */
function toPcm(audio: Buffer, mimeType: string | undefined) {
  if (audio.subarray(0, 4).toString('latin1') === 'RIFF' && audio.subarray(8, 12).toString('latin1') === 'WAVE') {
    let sampleRate = 24_000
    for (let at = 12; at + 8 <= audio.length; ) {
      const id = audio.subarray(at, at + 4).toString('latin1')
      const size = audio.readUInt32LE(at + 4)
      if (id === 'fmt ') sampleRate = audio.readUInt32LE(at + 12)
      if (id === 'data') return { pcm: audio.subarray(at + 8, Math.min(at + 8 + size, audio.length)), sampleRate }
      at += 8 + size + (size % 2)
    }
    throw new AppError('Google returned a WAV file without audio', 502, 'PROVIDER_ERROR')
  }
  const rate = Number(/rate=(\d+)/i.exec(mimeType ?? '')?.[1])
  return { pcm: audio, sampleRate: Number.isFinite(rate) && rate > 0 ? rate : 24_000 }
}

/**
 * Speech straight from Google's Gemini API (Interactions API), skipping
 * OpenRouter's fee. Nothing is stored at Google. Errors keep the HTTP status,
 * so the caller can tell "flex is full" (429/503) from other problems.
 */
export async function geminiSpeech({ model, text, voice, style, tier, timeoutMs }: GeminiSpeechRequest): Promise<GeminiSpeech> {
  if (!env.GEMINI_API_KEY) throw new AppError('GEMINI_API_KEY is not set', 500, 'PROVIDER_ERROR')
  const res = await fetch(`${BASE_URL}/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: model.replace(/^google\//, ''),
      input: [{ type: 'user_input', content: [{ type: 'text', text, ...(style && { annotations: [{ type: 'speech_metadata', style }] }) }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
      service_tier: tier,
      store: false,
    }),
  }).catch((e: unknown) => {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new AppError(`Google ${tier} speech timed out after ${timeoutMs}ms`, 504, 'PROVIDER_TIMEOUT')
    }
    throw e
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new AppError(`Google ${tier} speech failed (${res.status}): ${detail}`, res.status, 'PROVIDER_ERROR')
  }
  const body = (await res.json()) as InteractionResponse
  const audio = (body.steps ?? [])
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === 'audio' && c.data)
    .at(-1)
  if (!audio?.data) throw new AppError('Google returned no audio', 502, 'PROVIDER_ERROR')
  return { ...toPcm(Buffer.from(audio.data, 'base64'), audio.mime_type), tier: body.service_tier ?? tier }
}
