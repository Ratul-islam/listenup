import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

export type GeminiTier = 'standard' | 'flex'

export interface GeminiSpeechRequest {
  /** OpenRouter-style id ("google/gemini-3.8-flash-lite-tts") or Google's own */
  model: string
  text: string
  /** Prebuilt voice ("Sulafat"), or the id of a voice made with createReplicatedVoice() */
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
  const slow = (e: unknown): never => {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new AppError(`Google ${tier} speech timed out after ${timeoutMs}ms`, 504, 'PROVIDER_TIMEOUT')
    }
    throw e
  }
  const res = await fetch(`${BASE_URL}/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: googleModel(model),
      input: [{ type: 'user_input', content: [{ type: 'text', text, ...(style && { annotations: [{ type: 'speech_metadata', style }] }) }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
      service_tier: tier,
      store: false,
    }),
  }).catch(slow)
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new AppError(`Google ${tier} speech failed (${res.status}): ${detail}`, res.status, 'PROVIDER_ERROR')
  }
  // The timeout also covers reading the answer, which carries the audio
  const body = (await res.json().catch(slow)) as InteractionResponse
  const audio = (body.steps ?? [])
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === 'audio' && c.data)
    .at(-1)
  if (!audio?.data) throw new AppError('Google returned no audio', 502, 'PROVIDER_ERROR')
  return { ...toPcm(Buffer.from(audio.data, 'base64'), audio.mime_type), tier: body.service_tier ?? tier }
}

/** Google's own name for a model ("gemini-3.8-flash-lite-tts") */
const googleModel = (model: string) => model.replace(/^google\//, '')

// A stored voice ("voice_…", kept a year) or a stateless one ("voicekey_…", kept 7 days, not counted against the 200)
const VOICE_ID = /^voice(key)?_[\w-]+$/

/** The stored voice's id, wherever the answer carries it */
function voiceIdIn(body: unknown, depth = 0): string | null {
  if (typeof body === 'string') return VOICE_ID.test(body) ? body : null
  if (!body || typeof body !== 'object' || depth > 4) return null
  const known = body as { replicated_voice?: { id?: unknown }; id?: unknown }
  for (const id of [known.replicated_voice?.id, known.id]) if (typeof id === 'string' && VOICE_ID.test(id)) return id
  for (const value of Object.values(body)) {
    const id = voiceIdIn(value, depth + 1)
    if (id) return id
  }
  return null
}

export interface ReplicatedVoiceRequest {
  /** The model the voice will speak with (kept with it); Google makes the voice with its own default */
  model: string
  /** Shown in Google's console; no personal details */
  displayName: string
  /** 10 to 30 seconds of the speaker reading, as WAV */
  sourceWav: Buffer
  /** The same speaker saying Google's consent sentence, as WAV */
  consentWav: Buffer
  timeoutMs?: number
  /** False: a stateless voice key, kept by Google for 7 days and not counted against the project's 200 stored voices */
  store?: boolean
}

/**
 * Makes a voice from a recording of its owner ("voice replication"), stored at
 * Google under this project for a year (200 at most). Google checks that the
 * consent sentence is said, and by the same person. Returns the voice's id,
 * used like a prebuilt voice's name. Errors keep Google's HTTP status.
 */
export async function createReplicatedVoice({ displayName, sourceWav, consentWav, timeoutMs = 120_000, store = true }: ReplicatedVoiceRequest) {
  if (!env.GEMINI_API_KEY) throw new AppError('GEMINI_API_KEY is not set', 500, 'PROVIDER_ERROR')
  const wav = (audio: Buffer) => ({ mime_type: 'audio/wav', data: audio.toString('base64') })
  const res = await fetch(`${BASE_URL}/voices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      store,
      // No model: the speech models don't make voices ("does not support Voice Replication", Oct 2026). Google's
      // default makes it, and the voice then speaks with any speech model, ours included
      voice: { type: 'replicated', display_name: displayName, replicated: { source_audio: wav(sourceWav), consent_audio: wav(consentWav) } },
    }),
  }).catch((e: unknown) => {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new AppError(`Google voice creation timed out after ${timeoutMs}ms`, 504, 'PROVIDER_TIMEOUT')
    throw e
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 1500)
    // Google turns down recordings that fail its checks (the consent not said by the same person, or a voice
    // that isn't a real person's) with an error it can't put into words: a 500 saying "failed safety checks"
    // (Oct 2026). That's the recordings, not a passing fault, so it's reported as a refusal
    const status = /failed safety checks/i.test(detail) ? 422 : res.status
    throw new AppError(`Google voice creation failed (${res.status}): ${detail.slice(0, 500)}`, status, 'PROVIDER_ERROR')
  }
  const id = voiceIdIn(await res.json().catch(() => null))
  if (!id) throw new AppError('Google made a voice but returned no id for it', 502, 'PROVIDER_ERROR')
  return id
}

/** Removes a stored voice at Google. One that's already gone counts as removed. */
export async function deleteReplicatedVoice(voiceId: string) {
  if (!env.GEMINI_API_KEY) throw new AppError('GEMINI_API_KEY is not set', 500, 'PROVIDER_ERROR')
  const res = await fetch(`${BASE_URL}/voices/${encodeURIComponent(voiceId)}`, {
    method: 'DELETE',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok && res.status !== 404) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new AppError(`Google voice deletion failed (${res.status}): ${detail}`, res.status, 'PROVIDER_ERROR')
  }
}
