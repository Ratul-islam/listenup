import type { OtpPurpose, Prisma, PrismaClient, User } from '../../generated/prisma/client.js'
import { OTP_MAX_ATTEMPTS } from '../../config/constants.js'
import type { OAuthProfile } from './oauth/oauth.provider.js'

export class AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  // ---- Refresh tokens ----

  createRefreshToken(data: Prisma.RefreshTokenUncheckedCreateInput) {
    return this.db.refreshToken.create({ data })
  }

  findRefreshTokenByHash(tokenHash: string) {
    return this.db.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } })
  }

  findRefreshTokenById(id: string) {
    return this.db.refreshToken.findUnique({ where: { id }, include: { user: true } })
  }

  /**
   * Whether a session hasn't been ended. Logout and reuse detection revoke tokens
   * without a successor; rotation always names one. (A live token can't be the test:
   * a parallel refresh may not have saved its new token yet.)
   */
  async familyIsLive(familyId: string) {
    return (await this.db.refreshToken.count({ where: { familyId, revokedAt: { not: null }, replacedById: null } })) === 0
  }

  // Atomically retires a live token; false if it was already rotated or revoked
  async markRefreshTokenRotated(id: string, replacedById: string) {
    const { count } = await this.db.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById },
    })
    return count === 1
  }

  revokeRefreshTokenFamily(familyId: string) {
    return this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  revokeAllUserRefreshTokens(userId: string) {
    return this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  // ---- OTPs ----

  findLatestOtp(userId: string, purpose: OtpPurpose) {
    return this.db.otp.findFirst({ where: { userId, purpose }, orderBy: { createdAt: 'desc' } })
  }

  findOtpById(id: string) {
    return this.db.otp.findUnique({ where: { id } })
  }

  deleteOtps(userId: string, purpose: OtpPurpose) {
    return this.db.otp.deleteMany({ where: { userId, purpose } })
  }

  createOtp(data: Prisma.OtpUncheckedCreateInput) {
    return this.db.otp.create({ data })
  }

  // Consumes one attempt; false once the code has used up its attempts
  async claimOtpAttempt(id: string) {
    const { count } = await this.db.otp.updateMany({
      where: { id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    })
    return count === 1
  }

  markOtpVerified(id: string) {
    return this.db.otp.update({ where: { id }, data: { verifiedAt: new Date() } })
  }

  // Single-use guard; false if the code was already consumed
  async consumeOtp(id: string) {
    const { count } = await this.db.otp.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    return count === 1
  }

  // ---- OAuth accounts ----

  findOAuthAccount(provider: string, providerAccountId: string) {
    return this.db.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: true },
    })
  }

  createUserWithOAuthAccount(profile: OAuthProfile & { email: string }) {
    return this.db.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        emailVerifiedAt: new Date(),
        oauthAccounts: {
          create: { provider: profile.provider, providerAccountId: profile.providerAccountId },
        },
      },
    })
  }

  linkOAuthAccount(user: User, profile: OAuthProfile) {
    const wasVerified = user.emailVerifiedAt !== null
    return this.db.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        // An unverified sign-up's password may belong to someone squatting the
        // address; the provider just proved ownership, so drop it.
        ...(!wasVerified && { passwordHash: null }),
        name: user.name ?? profile.name,
        avatarUrl: user.avatarUrl ?? profile.avatarUrl,
        oauthAccounts: {
          create: { provider: profile.provider, providerAccountId: profile.providerAccountId },
        },
      },
    })
  }
}
