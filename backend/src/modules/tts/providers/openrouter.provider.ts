import { pcmRate, pcmToMp3 } from '../../../lib/audio/encode.js'
import { normalizeMp3 } from '../../../lib/audio/mp3.js'
import { env } from '../../../config/env.js'
import { geminiSpeech, type GeminiTier } from '../../../lib/gemini.js'
import { createSpeech, type SpeechRequest } from '../../../lib/openrouter.js'
import { AppError } from '../../../utils/AppError.js'
import type { SpeechRoute, SynthesisRequest, SynthesisResult, TtsProvider } from './tts-provider.js'

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

// Google directly (GEMINI_API_KEY): after repeated failures, use OpenRouter for a while.
// A flex request Google refuses outright (not offered for the model) stops flex for an hour.
const GOOGLE_BREAK_AFTER_FAILURES = 3
const GOOGLE_BREAK_MS = 60_000
const GOOGLE_REFUSED_BREAK_MS = 10 * 60_000
const FLEX_REFUSED_BREAK_MS = 60 * 60_000
const google = { failuresInRow: 0, pausedUntil: 0, flexPausedUntil: 0 }

/**
 * A Gemini voice made by Google directly, which skips OpenRouter's 5.5% fee. Work
 * nobody is waiting on tries the half-price flex tier first, then standard.
 * Returns null when Google can't make it now, so OpenRouter makes it instead.
 */
async function fromGoogle({ text, voice, style, background }: SynthesisRequest) {
  const now = Date.now()
  if (!env.GEMINI_API_KEY || !/gemini.*tts/i.test(voice.model) || now < google.pausedUntil) return null
  const tiers: GeminiTier[] = background && env.GEMINI_FLEX && now >= google.flexPausedUntil ? ['flex', 'standard'] : ['standard']
  for (const tier of tiers) {
    try {
      const speech = await geminiSpeech({
        model: voice.model,
        text,
        voice: voice.providerVoice,
        style,
        tier,
        timeoutMs: tier === 'flex' ? env.GEMINI_FLEX_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
      })
      google.failuresInRow = 0
      return { ...speech, route: (speech.tier === 'flex' ? 'google-flex' : 'google') as SpeechRoute }
    } catch (e) {
      const status = e instanceof AppError ? e.statusCode : 0
      const refused = status >= 400 && status < 500 && status !== 429
      console.warn(`[tts] Google ${tier} speech failed: ${e instanceof Error ? e.message : e}`)
      if (tier === 'flex') {
        if (refused) google.flexPausedUntil = Date.now() + FLEX_REFUSED_BREAK_MS
        continue
      }
      if (refused) google.pausedUntil = Date.now() + GOOGLE_REFUSED_BREAK_MS
      else if (++google.failuresInRow >= GOOGLE_BREAK_AFTER_FAILURES) google.pausedUntil = Date.now() + GOOGLE_BREAK_MS
    }
  }
  return null
}

async function speechWithRetries(req: SpeechRequest) {
  if (!/kokoro/i.test(req.model)) return { ...(await createSpeech(req, DEFAULT_TIMEOUT_MS)), route: 'openrouter' as SpeechRoute }
  // Busy (it voices one request at a time) or recently down: OpenRouter takes this one
  if (localAvailable()) {
    local.inFlight++
    try {
      return { ...(await localKokoro(req)), route: 'local' as SpeechRoute }
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
      return { ...result, route: 'openrouter' as SpeechRoute }
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

  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    const { text, voice, style } = req
    const direct = await fromGoogle(req)
    if (direct) {
      const { audio: mp3, durationMs } = normalizeMp3(pcmToMp3(direct.pcm, direct.sampleRate))
      return { audio: mp3, durationMs: durationMs || undefined, mimeType: 'audio/mpeg', extension: 'mp3', provider: this.name, model: voice.model, route: direct.route }
    }

    const pcm = PCM_MODELS.test(voice.model)
    const { audio, contentType, route } = await speechWithRetries({
      model: voice.model,
      input: text,
      voice: voice.providerVoice,
      style,
      responseFormat: pcm ? 'pcm' : 'mp3',
    })

    // Store everything as MP3 so clips stay small and play everywhere
    const encoded = pcm || /pcm/i.test(contentType ?? '') ? pcmToMp3(audio, pcmRate(contentType)) : audio
    const { audio: mp3, durationMs } = normalizeMp3(encoded)
    return { audio: mp3, durationMs: durationMs || undefined, mimeType: 'audio/mpeg', extension: 'mp3', provider: this.name, model: voice.model, route }
  }
}
