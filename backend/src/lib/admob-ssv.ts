import { createPublicKey, verify, type KeyObject } from 'node:crypto'

// Google's public keys for rewarded-ad server-side verification; they rotate, so refresh daily
const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json'
const KEYS_TTL_MS = 24 * 60 * 60_000

let cache: { keys: Map<string, KeyObject>; fetchedAt: number } | null = null

async function verifierKeys(force = false) {
  if (!force && cache && Date.now() - cache.fetchedAt < KEYS_TTL_MS) return cache.keys
  const res = await fetch(KEYS_URL, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`AdMob verifier keys: HTTP ${res.status}`)
  const body = (await res.json()) as { keys: { keyId: number; pem: string }[] }
  const keys = new Map(body.keys.map((k) => [String(k.keyId), createPublicKey(k.pem)]))
  cache = { keys, fetchedAt: Date.now() }
  return keys
}

export interface VerifiedReward {
  userId: string
  transactionId: string
  customData: string | null
}

/**
 * Checks an AdMob server-side verification callback. AdMob signs everything in
 * the query string before `&signature=` with ECDSA (SHA-256); `signature` and
 * `key_id` always come last. Returns the reward, or null if the signature is wrong.
 */
export async function verifyRewardCallback(rawUrl: string): Promise<VerifiedReward | null> {
  const query = rawUrl.slice(rawUrl.indexOf('?') + 1)
  const cut = query.indexOf('&signature=')
  if (cut < 0) return null
  const message = Buffer.from(query.slice(0, cut), 'utf8')
  const params = new URLSearchParams(query)
  const signature = params.get('signature')
  const keyId = params.get('key_id')
  const userId = params.get('user_id')
  const transactionId = params.get('transaction_id')
  if (!signature || !keyId || !userId || !transactionId) return null

  const sig = Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  let key = (await verifierKeys()).get(keyId)
  // A key we haven't seen may be newly rotated in
  if (!key) key = (await verifierKeys(true)).get(keyId)
  if (!key || !verify('sha256', message, { key, dsaEncoding: 'der' }, sig)) return null
  return { userId, transactionId, customData: params.get('custom_data') }
}
