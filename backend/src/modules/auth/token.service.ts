import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { User } from '../../generated/prisma/client.js'
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from '../../config/constants.js'
import type { RefreshTokenPayload } from '../../plugins/jwt.js'
import { AppError } from '../../utils/AppError.js'
import { sha256 } from '../../utils/util.js'
import type { AuthRepository } from './auth.repository.js'

export interface ClientContext {
  ip?: string
  userAgent?: string
}

export interface AuthTokens {
  accessToken: string
  accessTokenExpiresIn: number
  refreshToken: string
  refreshTokenExpiresAt: Date
}

// A token replaced this recently is forgiven once more (see inReuseGrace), as Auth0's
// "reuse interval" does; later reuse still ends the session
const REFRESH_REUSE_GRACE_MS = 30_000

const invalidRefreshToken = () =>
  new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN')
const reusedRefreshToken = () =>
  new AppError('Refresh token reuse detected, please log in again', 401, 'REFRESH_TOKEN_REUSED')

// Refresh tokens are single-use. Each rotation retires the presented token and
// issues a new one in the same family; presenting a retired token again means it
// leaked, so the whole family (that login session) is revoked.
export class TokenService {
  constructor(
    private readonly jwt: FastifyInstance['jwt'],
    private readonly authRepository: AuthRepository,
  ) {}

  async issue(
    user: Pick<User, 'id' | 'email'>,
    ctx: ClientContext,
    { familyId = randomUUID(), tokenId = randomUUID() }: { familyId?: string; tokenId?: string } = {},
  ): Promise<AuthTokens> {
    const accessToken = this.jwt.access.sign({ sub: user.id, email: user.email })
    const refreshToken = this.jwt.refresh.sign({ sub: user.id, jti: tokenId, fid: familyId })
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)

    await this.authRepository.createRefreshToken({
      id: tokenId,
      familyId,
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: refreshTokenExpiresAt,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    })

    return {
      accessToken,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresAt,
    }
  }

  /**
   * A token rotated moments ago, in a session that's still live: the app most
   * likely never got (or never saved) the new one, because it was closed or
   * lost its connection mid-refresh, or two refreshes crossed. It gets a fresh
   * token in the same session instead of being treated as stolen.
   */
  private async inReuseGrace(token: { revokedAt: Date | null; replacedById: string | null; familyId: string }) {
    if (!token.revokedAt || !token.replacedById) return false
    if (Date.now() - token.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) return false
    return this.authRepository.familyIsLive(token.familyId)
  }

  async rotate(refreshToken: string, ctx: ClientContext) {
    let payload: RefreshTokenPayload
    try {
      payload = this.jwt.refresh.verify<RefreshTokenPayload>(refreshToken)
    } catch {
      throw invalidRefreshToken()
    }

    const stored = await this.authRepository.findRefreshTokenByHash(sha256(refreshToken))
    if (!stored || stored.id !== payload.jti) throw invalidRefreshToken()

    if (stored.revokedAt) {
      // Rotated tokens have a successor; plain revoked ones (logout) don't
      if (stored.replacedById) {
        if (await this.inReuseGrace(stored)) return { user: stored.user, tokens: await this.issue(stored.user, ctx, { familyId: stored.familyId }) }
        await this.authRepository.revokeRefreshTokenFamily(stored.familyId)
        throw reusedRefreshToken()
      }
      throw invalidRefreshToken()
    }
    if (stored.expiresAt <= new Date()) throw invalidRefreshToken()

    const nextId = randomUUID()
    if (!(await this.authRepository.markRefreshTokenRotated(stored.id, nextId))) {
      // Another request rotated this exact token at the same moment: the app's own
      // parallel refreshes, unless it happened outside the grace window
      const latest = await this.authRepository.findRefreshTokenById(stored.id)
      if (latest && (await this.inReuseGrace(latest))) return { user: stored.user, tokens: await this.issue(stored.user, ctx, { familyId: stored.familyId }) }
      await this.authRepository.revokeRefreshTokenFamily(stored.familyId)
      throw reusedRefreshToken()
    }

    const tokens = await this.issue(stored.user, ctx, { familyId: stored.familyId, tokenId: nextId })
    return { user: stored.user, tokens }
  }

  // Logout: ends the session the token belongs to
  async revoke(refreshToken: string) {
    const stored = await this.authRepository.findRefreshTokenByHash(sha256(refreshToken))
    if (stored) await this.authRepository.revokeRefreshTokenFamily(stored.familyId)
  }

  async revokeAllForUser(userId: string) {
    await this.authRepository.revokeAllUserRefreshTokens(userId)
  }
}
