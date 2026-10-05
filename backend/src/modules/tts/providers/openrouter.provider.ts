import { pcmRate, pcmToMp3 } from '../../../lib/audio/encode.js'
import { normalizeMp3 } from '../../../lib/audio/mp3.js'
import { env } from '../../../config/env.js'
import { createSpeech, type SpeechRequest } from '../../../lib/openrouter.js'
import { AppError } from '../../../utils/AppError.js'
import type { SynthesisRequest, SynthesisResult, TtsProvider } from './tts-provider.js'

// Models asked for raw PCM, which we encode ourselves at our bitrate (Gemini TTS
// only returns PCM; Kokoro's own MP3s are larger than ours)
const PCM_MODELS = /gemini.*tts|kokoro/i

// Kokoro answers in a second or two, but its OpenRouter hosts sometimes hang on a
// request (Oct 2026: about half the time, on both). A short wait and another try on
// the other host beats one long wait. Gemini gets one longer try.
const KOKORO_ATTEMPTS = [
  { provider: 'Together', timeoutMs: 7_000 },
  { provider: 'DeepInfra', timeoutMs: 7_000 },
  { provider: 'Together', timeoutMs: 10_000 },
]
const DEFAULT_TIMEOUT_MS = 60_000

const retryable = (e: unknown) => e instanceof AppError && (e.code === 'PROVIDER_TIMEOUT' || (e.code === 'PROVIDER_ERROR' && e.statusCode >= 500))

// After this many Kokoro failures in a row, stop trying for a while and fail at once,
// so the app switches to the phone voice without waiting through every retry
const BREAK_AFTER_FAILURES = 3
const BREAK_FOR_MS = 30_000
const kokoro = { failuresInRow: 0, pausedUntil: 0 }

const stuck = () => new AppError('The voice service is slow right now. Try again in a moment.', 503, 'PROVIDER_TIMEOUT')

// Your own Kokoro server makes a full chunk in about 5 s on an 8-core CPU, one request at a
// time (Oct 2026), so a few queued requests can take a while; past this, use OpenRouter
const LOCAL_KOKORO_TIMEOUT_MS = 30_000

// After your Kokoro server fails, skip it for a while instead of waiting on it every time
const LOCAL_BREAK_MS = 30_000
const local = { inFlight: 0, pausedUntil: 0 }

/** Whether a request should go to your own Kokoro server now: it's set up, up, and not busy */
const localAvailable = () => !!env.KOKORO_URL && Date.now() >= local.pausedUntil && local.inFlight < env.KOKORO_MAX_IN_FLIGHT

/** Kokoro on your own server (Kokoro-FastAPI). Raw 24 kHz PCM, like OpenRouter's. */
async function localKokoro(req: SpeechRequest) {
  const res = await fetch(`${env.KOKORO_URL!.replace(/\/$/, '')}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(LOCAL_KOKORO_TIMEOUT_MS),
    body: JSON.stringify({ model: 'kokoro', input: req.input, voice: req.voice, response_format: 'pcm', speed: req.speed ?? 1, stream: false }),
  })
  if (!res.ok) throw new Error(`local Kokoro answered ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const audio = Buffer.from(await res.arrayBuffer())
  if (!audio.length) throw new Error('local Kokoro returned no audio')
  return { audio, contentType: res.headers.get('content-type') }
}

async function speechWithRetries(req: SpeechRequest) {
  if (!/kokoro/i.test(req.model)) return createSpeech(req, DEFAULT_TIMEOUT_MS)
  // Busy (it voices one request at a time) or recently down: OpenRouter takes this one
  if (localAvailable()) {
    local.inFlight++
    try {
      return await localKokoro(req)
    } catch (e) {
      local.pausedUntil = Date.now() + LOCAL_BREAK_MS
      console.warn(`[tts] local Kokoro failed, using OpenRouter for ${LOCAL_BREAK_MS / 1000}s: ${e instanceof Error ? e.message : e}`)
    } finally {
      local.inFlight--
    }
  }
  if (Date.now() < kokoro.pausedUntil) throw stuck()

  let last: unknown
  for (const { provider, timeoutMs } of KOKORO_ATTEMPTS) {
    try {
      const result = await createSpeech({ ...req, onlyProvider: provider }, timeoutMs)
      kokoro.failuresInRow = 0
      return result
    } catch (e) {
      if (!retryable(e)) throw e
      last = e
    }
  }
  if (++kokoro.failuresInRow >= BREAK_AFTER_FAILURES) {
    kokoro.pausedUntil = Date.now() + BREAK_FOR_MS
    console.warn(`[tts] Kokoro keeps timing out; failing fast for ${BREAK_FOR_MS / 1000}s`)
  }
  throw last
}

export class OpenRouterTtsProvider implements TtsProvider {
  readonly name = 'openrouter'
  readonly billable = true

  async synthesize({ text, voice, style }: SynthesisRequest): Promise<SynthesisResult> {
    const pcm = PCM_MODELS.test(voice.model)
    const { audio, contentType } = await speechWithRetries({
      model: voice.model,
      input: text,
      voice: voice.providerVoice,
      style,
      responseFormat: pcm ? 'pcm' : 'mp3',
    })

    // Store everything as MP3 so clips stay small and play everywhere
    const encoded = pcm || /pcm/i.test(contentType ?? '') ? pcmToMp3(audio, pcmRate(contentType)) : audio
    const { audio: mp3, durationMs } = normalizeMp3(encoded)
    return { audio: mp3, durationMs: durationMs || undefined, mimeType: 'audio/mpeg', extension: 'mp3', provider: this.name, model: voice.model }
  }
}
