import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { safeEqual } from '../../utils/util.js'

// Derived so no extra secret has to be configured
const secret = crypto.createHash('sha256').update(`files:${env.JWT_ACCESS_SECRET}`).digest()

export function signFileToken(key: string, exp: number) {
  return crypto.createHmac('sha256', secret).update(`${key}:${exp}`).digest('base64url')
}

export function verifyFileToken(key: string, exp: number, sig: string) {
  return exp > Date.now() / 1000 && safeEqual(signFileToken(key, exp), sig)
}
