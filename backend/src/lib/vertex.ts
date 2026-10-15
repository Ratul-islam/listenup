import { createSign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

/**
 * Gemini voices through Google Cloud's Vertex AI, signed in as a service account
 * (role "Vertex AI User"). Same voices and price as the Gemini API key, billed to
 * the Cloud project (and its credits), and without the Gemini API's first-tier
 * limit of 100 speech requests a day: 30 in under a minute all went through
 * (Oct 2026). The speech models are only served from the "global" location.
 */

interface ServiceAccount {
  client_email: string
  private_key: string
  project_id: string
}

/**
 * The key's JSON from VERTEX_KEY: the JSON itself (hosts), the path of its file (local), or the
 * JSON pasted with quotes around it or base64-encoded. Null if it's none of these.
 */
function keyJson(raw: string): string | null {
  const value = raw.replace(/^(['"])([\s\S]*)\1$/, '$2').trim()
  if (value.startsWith('{')) return value
  if (existsSync(value)) return readFileSync(value, 'utf8')
  if (/^[A-Za-z0-9+/=\s]+$/.test(value)) {
    const decoded = Buffer.from(value, 'base64').toString('utf8').trim()
    if (decoded.startsWith('{')) return decoded
  }
  return null
}

/**
 * VERTEX_KEY as a service account. Its value is never written to the logs, nor
 * JSON.parse's message (which quotes part of the text it choked on): a key
 * that's set up wrong would otherwise put the private key there.
 */
function loadAccount(): ServiceAccount | null {
  const value = env.VERTEX_KEY?.trim()
  if (!value) return null
  const json = keyJson(value)
  if (!json) {
    console.warn(`[vertex] VERTEX_KEY is neither a service account key nor a file that exists (${value.length} characters); Vertex is off`)
    return null
  }
  let account: Partial<ServiceAccount>
  try {
    account = JSON.parse(json) as Partial<ServiceAccount>
  } catch {
    console.warn("[vertex] VERTEX_KEY isn't valid JSON; Vertex is off")
    return null
  }
  if (!account.client_email || !account.private_key || !account.project_id) {
    console.warn("[vertex] VERTEX_KEY is missing client_email, private_key or project_id; Vertex is off")
    return null
  }
  return account as ServiceAccount
}

const account = loadAccount()
export const vertexEnabled = !!account

// An access token lasts an hour; a new one is fetched a few minutes before it runs out
const token = { value: '', expiresAt: 0, pending: null as Promise<string> | null }

async function accessToken(): Promise<string> {
  if (token.value && Date.now() < token.expiresAt) return token.value
  token.pending ??= (async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const now = Math.floor(Date.now() / 1000)
    const claims = { iss: account!.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}`
    const signature = createSign('RSA-SHA256').update(unsigned).sign(account!.private_key).toString('base64url')
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
      signal: AbortSignal.timeout(15_000),
    })
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string }
    if (!res.ok || !body.access_token) throw new AppError(`Vertex sign-in failed (${res.status}): ${body.error_description ?? ''}`, res.status || 502, 'PROVIDER_ERROR')
    token.value = body.access_token
    token.expiresAt = Date.now() + ((body.expires_in ?? 3600) - 300) * 1000
    return token.value
  })().finally(() => {
    token.pending = null
  })
  return token.pending
}

interface GenerateResponse {
  candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]
}

/** Raw PCM and its rate from a WAV file (what Vertex returns) or headerless L16 */
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
    throw new AppError('Vertex returned a WAV file without audio', 502, 'PROVIDER_ERROR')
  }
  const rate = Number(/rate=(\d+)/i.exec(mimeType ?? '')?.[1])
  return { pcm: audio, sampleRate: Number.isFinite(rate) && rate > 0 ? rate : 24_000 }
}

export interface VertexSpeechRequest {
  /** OpenRouter-style id ("google/gemini-3.8-flash-lite-tts") or Google's own */
  model: string
  text: string
  /** A prebuilt voice ("Sulafat") */
  voice: string
  /** Delivery direction, sent as speech metadata rather than spoken. Followed like the Gemini API's
   * (Oct 2026, 4 takes each: whispered 3 of 4 with it, 0 of 4 without; "very slowly" halved the pace) */
  style?: string
  timeoutMs: number
}

/**
 * Speech from Vertex AI. The per-line direction field is on v1beta1 only.
 * Errors keep the HTTP status, so a 429 can be told from other problems.
 */
export async function vertexSpeech({ model, text, voice, style, timeoutMs }: VertexSpeechRequest) {
  if (!account) throw new AppError('VERTEX_KEY is not set', 500, 'PROVIDER_ERROR')
  const name = model.replace(/^google\//, '')
  const location = env.VERTEX_LOCATION
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`
  const url = `https://${host}/v1beta1/projects/${account.project_id}/locations/${location}/publishers/google/models/${name}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text, ...(style && { speechMetadata: { style } }) }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
  }).catch((e: unknown) => {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new AppError(`Vertex speech timed out after ${timeoutMs}ms`, 504, 'PROVIDER_TIMEOUT')
    throw e
  })
  if (!res.ok) {
    // A token Google stopped accepting is fetched again next time
    if (res.status === 401) token.expiresAt = 0
    const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
    throw new AppError(`Vertex speech failed (${res.status}): ${detail}`, res.status, 'PROVIDER_ERROR')
  }
  const body = (await res.json()) as GenerateResponse
  const audio = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
  if (!audio?.data) throw new AppError('Vertex returned no audio', 502, 'PROVIDER_ERROR')
  return toPcm(Buffer.from(audio.data, 'base64'), audio.mimeType)
}
