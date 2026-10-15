import { adjustPcm, isAdjusted } from '../../../lib/audio/adjust.js'
import { pcmRate, pcmToMp3 } from '../../../lib/audio/encode.js'
import { lengthFault, paceOf } from '../../../lib/audio/length.js'
import { fadeEdges, levelPcm, pcmLevel, SPEECH_LEVEL_DB } from '../../../lib/audio/level.js'
import { normalizeMp3 } from '../../../lib/audio/mp3.js'
import { measure, pcmOfSamples, samplesOfPcm, type Prosody } from '../../../lib/audio/prosody.js'
import { fit, reshape, type Fit } from '../../../lib/audio/reshape.js'
import { trimPcm } from '../../../lib/audio/trim.js'
import { voicedShare } from '../../../lib/audio/voicing.js'
import { env } from '../../../config/env.js'
import { geminiSpeech, type GeminiTier } from '../../../lib/gemini.js'
import { createSpeech, type SpeechRequest } from '../../../lib/openrouter.js'
import { vertexEnabled, vertexSpeech } from '../../../lib/vertex.js'
import { AppError } from '../../../utils/AppError.js'
import type { DeliveryCheck, SpeechJoin, SpeechRoute, SpeechSegment, SynthesisRequest, SynthesisResult, TtsProvider } from './tts-provider.js'

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

// Google limits requests per model: for a speech model on a new paid project (Tier 1, Oct 2026),
// 10 a minute and 100 a day, raised at Tier 2 ($100 paid and 3 days). Past one, Google answers 429
// "Rate limit exceeded … retry in 42s" (or "in 15h8m41s"). Until then that model's speech goes to
// OpenRouter without asking first.
const rateLimitedUntil = new Map<string, number>()
const RATE_LIMIT_WAIT_MS = 30_000

/** How long Google said to wait, when an error is one of its rate limits (not flex being full) */
function rateLimitWait(e: unknown) {
  if (!(e instanceof AppError) || e.statusCode !== 429 || !/rate limit/i.test(e.message)) return null
  const after = /retry in ((?:\d+h)?(?:\d+m(?!s))?(?:\d+(?:\.\d+)?s)?)/i.exec(e.message)?.[1]
  const part = (unit: string) => Number(new RegExp(`([\\d.]+)${unit}`, 'i').exec(after ?? '')?.[1] ?? 0)
  const ms = (part('h') * 3600 + part('m') * 60 + part('s')) * 1000
  return ms > 0 ? Math.ceil(ms) : RATE_LIMIT_WAIT_MS
}

// Vertex AI (VERTEX_KEY): tried before the Gemini API key, to spend the Cloud project's credits and
// keep clear of the key's 100 requests a day. The same breaks as the key, on their own count
const vertex = { failuresInRow: 0, pausedUntil: 0 }

/** A Gemini voice made through Vertex AI; null when it can't be made there now */
async function fromVertex({ text, voice, style }: SynthesisRequest) {
  const now = Date.now()
  const limited = `vertex:${voice.model}`
  if (!vertexEnabled || !/gemini.*tts/i.test(voice.model) || now < vertex.pausedUntil || now < (rateLimitedUntil.get(limited) ?? 0)) return null
  try {
    const speech = await vertexSpeech({ model: voice.model, text, voice: voice.providerVoice, style, timeoutMs: DEFAULT_TIMEOUT_MS })
    vertex.failuresInRow = 0
    return { ...speech, route: 'vertex' as SpeechRoute }
  } catch (e) {
    const status = e instanceof AppError ? e.statusCode : 0
    // Vertex says "Resource exhausted", usually without a time to wait
    if (status === 429) {
      const wait = rateLimitWait(e) ?? RATE_LIMIT_WAIT_MS
      rateLimitedUntil.set(limited, Date.now() + wait)
      console.warn(`[tts] Vertex is out of capacity for ${voice.model}: the Gemini API key or OpenRouter for ${Math.round(wait / 1000)} s`)
      return null
    }
    console.warn(`[tts] Vertex speech failed: ${e instanceof Error ? e.message : e}`)
    if (status >= 400 && status < 500) vertex.pausedUntil = Date.now() + GOOGLE_REFUSED_BREAK_MS
    else if (++vertex.failuresInRow >= GOOGLE_BREAK_AFTER_FAILURES) vertex.pausedUntil = Date.now() + GOOGLE_BREAK_MS
    return null
  }
}

/**
 * A Gemini voice made by Google directly, which skips OpenRouter's 5.5% fee. Work
 * nobody is waiting on tries the half-price flex tier first, then standard.
 * Returns null when Google can't make it now, so OpenRouter makes it instead.
 */
async function fromGoogle({ text, voice, style, background }: SynthesisRequest) {
  const now = Date.now()
  if (!env.GEMINI_API_KEY || !/gemini.*tts/i.test(voice.model) || now < google.pausedUntil || now < (rateLimitedUntil.get(voice.model) ?? 0)) return null
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
      // Another tier counts against the same limit, so OpenRouter makes this one
      const wait = rateLimitWait(e)
      if (wait) {
        rateLimitedUntil.set(voice.model, Date.now() + wait)
        console.warn(`[tts] Google's requests-a-minute limit for ${voice.model}: OpenRouter for ${Math.round(wait / 1000)} s`)
        return null
      }
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

// A listener's own voice exists only at Google, so there's nowhere else to send it. A refusal
// is about that one voice (or flex for such voices), and mustn't pause Google for everyone
const OWN_FLEX_REFUSED_BREAK_MS = 60 * 60_000
const ownVoices = { flexPausedUntil: 0 }

const ownVoiceUnavailable = () => new AppError('Your own voice can’t be used right now. Try again in a moment, or pick another voice.', 503, 'OWN_VOICE_UNAVAILABLE')

// With nowhere else to send it, an own voice past Google's requests-a-minute limit waits as long as
// Google says (plus a little, so a document's parts don't all come back at once) and tries again
const OWN_RATE_LIMIT_TRIES = 3
const OWN_RATE_LIMIT_MAX_WAIT_MS = 65_000

/** Speech in a listener's own voice, made by Google directly: flex first for work nobody waits on */
async function inOwnVoice({ text, voice, style, background }: SynthesisRequest) {
  if (!env.GEMINI_API_KEY) throw ownVoiceUnavailable()
  const tiers: GeminiTier[] = background && env.GEMINI_FLEX && Date.now() >= ownVoices.flexPausedUntil ? ['flex', 'standard'] : ['standard']
  for (const tier of tiers) {
    for (let tries = 1; ; tries++) {
      try {
        const speech = await geminiSpeech({
          model: voice.model,
          text,
          voice: voice.providerVoice,
          style,
          tier,
          timeoutMs: tier === 'flex' ? env.GEMINI_FLEX_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
        })
        return { ...speech, route: (speech.tier === 'flex' ? 'google-flex' : 'google') as SpeechRoute }
      } catch (e) {
        const wait = rateLimitWait(e)
        if (wait && wait <= OWN_RATE_LIMIT_MAX_WAIT_MS && tries < OWN_RATE_LIMIT_TRIES) {
          console.warn(`[tts] Google's requests-a-minute limit for an own voice: trying again in ${Math.round(wait / 1000)} s`)
          await new Promise((resolve) => setTimeout(resolve, wait + Math.random() * 5_000))
          continue
        }
        const status = e instanceof AppError ? e.statusCode : 0
        console.warn(`[tts] Google ${tier} speech in an own voice failed: ${e instanceof Error ? e.message : e}`)
        if (tier === 'flex' && status >= 400 && status < 500 && status !== 429) ownVoices.flexPausedUntil = Date.now() + OWN_FLEX_REFUSED_BREAK_MS
        break
      }
    }
  }
  throw ownVoiceUnavailable()
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

// Runs of one part voiced side by side; more at once gains little and invites rate limits
const SEGMENT_CONCURRENCY = 4

/** `madeMs` is all the speech made for it, takes that weren't kept included */
type Spoken = { pcm: Buffer; rate: number; route: SpeechRoute; joins?: SpeechJoin[]; madeMs?: number } | { pcm?: undefined; encoded: Buffer; route: SpeechRoute }

const msOf = (pcm: Buffer, rate: number) => Math.round((pcm.length / 2 / rate) * 1000)

/** One request's speech: PCM without its long silences (Gemini, Kokoro), or the provider's own MP3 */
async function speak(req: SynthesisRequest): Promise<Spoken> {
  // An own voice exists only under the Gemini API key; other Gemini voices try Vertex first
  const direct = req.voice.own ? await inOwnVoice(req) : ((await fromVertex(req)) ?? (await fromGoogle(req)))
  if (direct) return { pcm: trimPcm(direct.pcm, direct.sampleRate), rate: direct.sampleRate, route: direct.route }

  const { text, voice, style } = req
  const pcm = PCM_MODELS.test(voice.model)
  const { audio, contentType, route } = await speechWithRetries({
    model: voice.model,
    input: text,
    voice: voice.providerVoice,
    style,
    responseFormat: pcm ? 'pcm' : 'mp3',
  })
  if (!pcm && !/pcm/i.test(contentType ?? '')) return { encoded: audio, route }
  const rate = pcmRate(contentType)
  return { pcm: trimPcm(audio, rate), rate, route }
}

// Gemini follows a style only about half the time per request (measured Oct 2026: 50–60%
// for a whisper, whatever the wording). Where the result can be measured, a take that
// missed is made again, up to this many takes unless the plan says otherwise; the extra
// takes are our cost, not the listener's.
const DELIVERY_TAKES = 3
// Longer text costs too much to make again
const CHECK_MAX_CHARS = 500
// A voice that takes directions sometimes stops before the end of its words, or carries on past them.
// A take whose length can't be its text is made again, this many takes at most
const LENGTH_TAKES = 2

/**
 * How much of a delivery is in a take (higher is more), and the score at which it's clearly there
 * and no further take is needed. Measured Oct 2026, on the audio as the voice returns it:
 * - A whisper has almost no voice in it: ordinary speech is about half voiced, whispers under 0.2.
 * - An angry or shouted line comes back louder. Takes that an audio model heard as angry were at
 *   −11 to −13 dB, the ones it heard as plain at −14 to −17.
 * - A sad or frightened line is slower. Takes heard that way ran at 0.61 to 0.88 of the language's
 *   usual pace, plain ones at 0.77 to 1.18 (the same words by the same voice).
 * Which of two takes of the same words has more of it is the dependable part; the line for
 * "clearly there" only saves a second take when the first leaves no doubt.
 */
const DELIVERY: Record<DeliveryCheck, { score(pcm: Buffer, rate: number, req: SynthesisRequest): number | null; clear: number }> = {
  whisper: { score: (pcm, rate) => -voicedShare(pcm, rate), clear: -0.3 },
  loud: { score: (pcm, rate) => pcmLevel(pcm, rate), clear: -13 },
  slow: {
    score: (pcm, rate, req) => {
      const pace = paceOf(pcm, rate, req.text.replace(/<[^>]+>/g, ' '), req.voice.language)
      return pace === null ? null : -pace
    },
    clear: -0.8,
  },
}

// A line the listener performed themselves ("Say it yourself"): this many takes are made at once,
// and the one that needs the least reshaping is shaped to the performance. They're our cost.
const SHAPE_TAKES = 3
// Sound for sound, a take this unlike the performance can't be lined up with it: other words, or a
// recording too noisy to follow. Actors' recordings against a take of the same words came to 3.8
// to 6.2, and to 9 when the take ran at more than twice their pace (27 recordings, Oct 2026).
const MAX_MISMATCH = 7.5

/**
 * A take shaped to the listener's own performance of its words: their timing,
 * their stops, their tune and their stress, in the take's voice (see reshape).
 * Of the takes made, the one closest to the performance to begin with is
 * used, since the less a take is bent the more natural it stays. Null when
 * none of them can be lined up with the performance.
 */
async function speakShaped(req: SynthesisRequest, said: Prosody): Promise<(Spoken & { pcm: Buffer }) | null> {
  const made = await Promise.allSettled(Array.from({ length: SHAPE_TAKES }, () => speak(req)))
  const takes = made.flatMap((result) => (result.status === 'fulfilled' && result.value.pcm ? [result.value] : []))
  if (!takes.length) {
    const failed = made.find((result) => result.status === 'rejected')
    if (failed) throw failed.reason
    return null
  }
  const madeMs = takes.reduce((ms, take) => ms + msOf(take.pcm, take.rate), 0)
  let best: { take: (typeof takes)[number]; samples: Float32Array; prosody: Prosody; plan: Fit; effort: number } | null = null
  for (const take of takes) {
    if (lengthFault(take.pcm, take.rate, req.text, req.voice.language)) continue
    const samples = samplesOfPcm(take.pcm)
    const prosody = measure(samples, take.rate)
    const plan = fit(prosody, said, req.shape)
    if (!plan || plan.mismatch > MAX_MISMATCH) continue
    // How well the two line up, sound for sound, comes first: a take laid over the wrong words needs little
    // bending and sounds wrong. Then how far its pace (in octaves) and its pitch (in semitones) have to move.
    const effort = plan.mismatch + plan.stretch + plan.bend / 6
    if (!best || effort < best.effort) best = { take, samples, prosody, plan, effort }
  }
  if (!best) {
    console.warn(`[tts] none of ${takes.length} takes by ${req.voice.id} could be lined up with the listener's performance; the line is voiced unshaped`)
    return { ...takes[0], madeMs }
  }
  const { plan } = best
  console.log(
    `[tts] a performed line by ${req.voice.id}: take ${takes.indexOf(best.take) + 1} of ${takes.length} shaped over ${((plan.to - plan.from) / 100).toFixed(1)} s ` +
      `(sounds ${plan.mismatch.toFixed(1)} apart, pace moved ${plan.stretch.toFixed(2)} octaves, pitch ${plan.bend.toFixed(1)} semitones)`,
  )
  return { ...best.take, pcm: pcmOfSamples(reshape(best.samples, best.take.rate, best.prosody, plan)), madeMs }
}

/**
 * Speech that's checked before it's used: that it's about as long as its
 * words (voices that take directions only), and that the delivery asked for
 * is in it, where that can be measured. The first take that passes, or the
 * one with the most of it. Then it's levelled: voices come back at whatever
 * volume the direction gave them, and Natural ones quieter than Expressive.
 */
async function speakChecked(req: SynthesisRequest): Promise<Spoken> {
  const { voice } = req
  // Levelled, then at the script's own pace and pitch (Studio), if it has them
  const levelled = <T extends Spoken & { pcm: Buffer }>(spoken: T): T => {
    const pcm = levelPcm(spoken.pcm, spoken.rate, SPEECH_LEVEL_DB + (req.levelDb ?? 0))
    return { ...spoken, pcm: isAdjusted(req.adjust) ? adjustPcm(pcm, spoken.rate, req.adjust) : pcm }
  }
  if (!voice.expressive) {
    const spoken = await speak(req)
    return spoken.pcm ? levelled(spoken) : spoken
  }
  if (req.shape?.said) {
    const shaped = await speakShaped(req, req.shape.said)
    if (shaped) return levelled(shaped)
  }
  const delivery = req.check && req.text.length <= CHECK_MAX_CHARS ? DELIVERY[req.check] : null
  const takes = delivery ? (req.tries ?? DELIVERY_TAKES) : LENGTH_TAKES
  let best: { spoken: Spoken & { pcm: Buffer }; whole: boolean; score: number } | null = null
  let madeMs = 0
  for (let take = 0; take < takes; take++) {
    let spoken: Spoken
    try {
      spoken = await speak(req)
    } catch (e) {
      // A later take failing doesn't lose the one we have
      if (best) break
      throw e
    }
    if (!spoken.pcm) return spoken
    madeMs += msOf(spoken.pcm, spoken.rate)
    const fault = lengthFault(spoken.pcm, spoken.rate, req.text, voice.language)
    if (fault) console.warn(`[tts] a take by ${voice.id} came back too ${fault} for its ${req.text.length} characters (take ${take + 1})`)
    // Too short to measure: any take with its words will do
    const score = delivery?.score(spoken.pcm, spoken.rate, req) ?? null
    // A take with all its words beats one without; of two with them, the one with more of the delivery wins.
    // (Judged on the whisper alone, a take with next to nothing in it looked like the best one.)
    if (!best || (!fault && !best.whole) || (!fault === best.whole && score !== null && score > best.score)) best = { spoken, whole: !fault, score: score ?? -Infinity }
    if (!fault && (!delivery || score === null || score >= delivery.clear)) break
  }
  return { ...levelled(best!.spoken), madeMs }
}

/** One of a part's takes failing loses the whole part (and the app switches to the phone's voice), so each gets a second try */
async function twice<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (e) {
    if (!retryable(e)) throw e
    return work()
  }
}

/** Runs `work` over `items`, a few at a time, keeping their order */
async function pooled<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) results[i] = await work(items[i])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export class OpenRouterTtsProvider implements TtsProvider {
  readonly name = 'openrouter'
  readonly billable = true

  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    const { voice } = req
    const spoken = req.segments?.length ? await this.joined(req, req.segments) : await speakChecked(req)
    // Store everything as MP3 so clips stay small and play everywhere, without the long silence at either end
    const { audio: mp3, durationMs } = normalizeMp3(spoken.pcm ? pcmToMp3(spoken.pcm, spoken.rate) : spoken.encoded)
    const joins = spoken.pcm ? spoken.joins : undefined
    const madeMs = spoken.pcm ? spoken.madeMs : undefined
    return { audio: mp3, durationMs: durationMs || undefined, ...(madeMs && { madeMs }), mimeType: 'audio/mpeg', extension: 'mp3', provider: this.name, model: voice.model, route: spoken.route, ...(joins?.length && { joins }) }
  }

  /**
   * Runs said differently or read by different voices (a character's lines),
   * each voiced on its own, then joined with the pauses that belong between
   * them. One voice and one short style per request is what the service takes
   * and follows (see planRender). Where each run starts is kept, so the player
   * can show the line (and the character) being heard after every join.
   */
  private async joined(req: SynthesisRequest, segments: SpeechSegment[]): Promise<Spoken> {
    const clips = await pooled(segments, SEGMENT_CONCURRENCY, (s) =>
      twice(() => speakChecked({ ...req, voice: s.voice ?? req.voice, text: s.text, style: s.style, check: s.check, tries: s.tries, levelDb: s.levelDb, shape: s.shape, segments: undefined })),
    )
    const rate = clips[0]?.pcm ? clips[0].rate : 0
    const parts: Buffer[] = []
    const joins: SpeechJoin[] = []
    let bytes = 0
    let madeMs = 0
    const add = (audio: Buffer) => {
      parts.push(audio)
      bytes += audio.length
    }
    clips.forEach((clip, i) => {
      // Only raw audio at one rate can be joined; every voice that takes emotions gives that
      if (!clip.pcm || clip.rate !== rate) throw new AppError("This voice can't change emotion within a part.", 502, 'PROVIDER_ERROR')
      if (segments[i].gapMs > 0) add(Buffer.alloc(Math.round((segments[i].gapMs / 1000) * rate) * 2))
      if (i > 0) joins.push({ at: segments[i].at, ms: Math.round((bytes / 2 / rate) * 1000) })
      add(fadeEdges(clip.pcm, rate))
      madeMs += clip.madeMs ?? msOf(clip.pcm, rate)
    })
    return { pcm: Buffer.concat(parts), rate, route: clips[0].route, joins, madeMs }
  }
}
