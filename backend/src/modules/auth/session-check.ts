import { prisma } from '../../config/db.js'
import { AuthRepository } from './auth.repository.js'

const authRepository = new AuthRepository(prisma)

// How long a "still signed in" answer is trusted before the database is asked again.
// Ending a session in this process forgets it at once; another process (a second
// instance) notices within this time instead of the access token's 15 minutes
const TRUST_MS = 30_000
const MAX_REMEMBERED = 10_000

const live = new Map<string, { userId: string; checkedAt: number }>()
// An ended session never opens again, so it's remembered without asking again: a
// stolen token from one can't make every request cost a database query
const ended = new Set<string>()

/**
 * Whether the login session an access token came from is still open. Logout,
 * "sign out everywhere", a password reset, closing the account and a stolen
 * refresh token all end the session, and its access tokens stop working with it.
 */
export async function sessionIsLive(sessionId: string, userId: string) {
  if (ended.has(`${sessionId}:${userId}`)) return false
  const known = live.get(sessionId)
  if (known && known.userId === userId && Date.now() - known.checkedAt < TRUST_MS) return true

  const ok = await authRepository.sessionIsLive(sessionId, userId)
  live.delete(sessionId)
  if (!ok) {
    if (ended.size >= MAX_REMEMBERED) ended.delete(ended.values().next().value!)
    ended.add(`${sessionId}:${userId}`)
  } else {
    // Oldest first: a Map keeps the order entries were added in
    if (live.size >= MAX_REMEMBERED) live.delete(live.keys().next().value!)
    live.set(sessionId, { userId, checkedAt: Date.now() })
  }
  return ok
}

/** Call when one session ends */
export function forgetSession(sessionId: string) {
  live.delete(sessionId)
}

/** Call when every session of a user ends */
export function forgetUserSessions(userId: string) {
  for (const [sessionId, entry] of live) if (entry.userId === userId) live.delete(sessionId)
}
