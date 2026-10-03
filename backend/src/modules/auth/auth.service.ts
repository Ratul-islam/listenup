import type { FastifyInstance } from 'fastify'
import { OtpPurpose, type User } from '../../generated/prisma/client.js'
import type { ResetTokenPayload } from '../../plugins/jwt.js'
import { AppError } from '../../utils/AppError.js'
import { sendEmail } from '../../utils/email.js'
import { fakePasswordCheck, hashPassword, verifyPassword } from '../../utils/password.js'
import type { UsersRepository } from '../users/users.repository.js'
import { deletionDate, toPublicUser } from '../users/users.service.js'
import type { AuthRepository } from './auth.repository.js'
import type {
  EmailBody,
  EmailOtpBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
} from './auth.schema.js'
import { passwordResetEmail, verificationEmail } from './auth.emails.js'
import { invalidOtp, type OtpService } from './otp.service.js'
import type { ClientContext, TokenService } from './token.service.js'
import { getOAuthProvider } from './oauth/oauth.registry.js'
import type { OAuthProfile } from './oauth/oauth.provider.js'

const invalidResetToken = () =>
  new AppError('Reset session is invalid or has expired', 400, 'INVALID_RESET_TOKEN')

export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
    private readonly jwt: FastifyInstance['jwt'],
  ) {}

  // ---- Email / password ----

  async register({ email, password, name }: RegisterBody) {
    const existing = await this.usersRepository.findByEmail(email)
    if (existing?.emailVerifiedAt) {
      throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN')
    }

    const passwordHash = await hashPassword(password)
    let code: string

    if (existing) {
      // Sign-up retried before verifying: replace the pending credentials and resend
      code = await this.otpService.issue(existing.id, OtpPurpose.EMAIL_VERIFICATION)
      await this.usersRepository.update(existing.id, { passwordHash, name: name ?? existing.name })
    } else {
      const user = await this.usersRepository.create({ email, passwordHash, name })
      code = await this.otpService.issue(user.id, OtpPurpose.EMAIL_VERIFICATION)
    }

    await sendEmail({ to: email, ...verificationEmail(code) })
  }

  async verifyEmail({ email, otp }: EmailOtpBody, ctx: ClientContext) {
    const user = await this.usersRepository.findByEmail(email)
    if (!user || user.emailVerifiedAt) throw invalidOtp()

    const record = await this.otpService.verify(user.id, OtpPurpose.EMAIL_VERIFICATION, otp)
    await this.otpService.consume(record.id)
    const verified = await this.usersRepository.update(user.id, { emailVerifiedAt: new Date() })

    return this.startSession(verified, ctx)
  }

  async resendVerification({ email }: EmailBody) {
    const user = await this.usersRepository.findByEmail(email)
    if (!user || user.emailVerifiedAt) return

    const code = await this.otpService.issue(user.id, OtpPurpose.EMAIL_VERIFICATION)
    await sendEmail({ to: user.email, ...verificationEmail(code) })
  }

  async login({ email, password }: LoginBody, ctx: ClientContext) {
    const user = await this.usersRepository.findByEmail(email)
    const valid = user?.passwordHash
      ? await verifyPassword(password, user.passwordHash)
      : await fakePasswordCheck(password)

    if (!user || !valid) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS')
    }
    if (!user.emailVerifiedAt) {
      throw new AppError('Please verify your email before logging in', 403, 'EMAIL_NOT_VERIFIED')
    }

    return this.startSession(user, ctx)
  }

  // ---- Sessions ----

  async refresh(refreshToken: string, ctx: ClientContext) {
    const { user, tokens } = await this.tokenService.rotate(refreshToken, ctx)
    return { user: toPublicUser(user), ...tokens }
  }

  logout(refreshToken: string) {
    return this.tokenService.revoke(refreshToken)
  }

  logoutAll(userId: string) {
    return this.tokenService.revokeAllForUser(userId)
  }

  // ---- Password reset: forgot -> verify code -> reset ----

  async forgotPassword({ email }: EmailBody) {
    const user = await this.usersRepository.findByEmail(email)
    if (!user) return

    const code = await this.otpService.issue(user.id, OtpPurpose.PASSWORD_RESET)
    await sendEmail({ to: user.email, ...passwordResetEmail(code) })
  }

  async verifyResetOtp({ email, otp }: EmailOtpBody) {
    const user = await this.usersRepository.findByEmail(email)
    if (!user) throw invalidOtp()

    const record = await this.otpService.verify(user.id, OtpPurpose.PASSWORD_RESET, otp)
    await this.authRepository.markOtpVerified(record.id)

    const resetToken = this.jwt.reset.sign({ sub: user.id, otpId: record.id })
    return { resetToken }
  }

  async resetPassword({ resetToken, password }: ResetPasswordBody) {
    let payload: ResetTokenPayload
    try {
      payload = this.jwt.reset.verify<ResetTokenPayload>(resetToken)
    } catch {
      throw invalidResetToken()
    }

    // The reset token is bound to its OTP row, which can be consumed only once
    const otp = await this.authRepository.findOtpById(payload.otpId)
    if (
      !otp ||
      otp.userId !== payload.sub ||
      otp.purpose !== OtpPurpose.PASSWORD_RESET ||
      !otp.verifiedAt
    ) {
      throw invalidResetToken()
    }
    if (!(await this.authRepository.consumeOtp(otp.id))) throw invalidResetToken()

    const user = await this.usersRepository.findById(payload.sub)
    if (!user) throw invalidResetToken()

    const now = new Date()
    await this.usersRepository.update(user.id, {
      passwordHash: await hashPassword(password),
      passwordChangedAt: now,
      // Receiving the code proves ownership of the address
      emailVerifiedAt: user.emailVerifiedAt ?? now,
    })

    // Sign out every device
    await this.tokenService.revokeAllForUser(user.id)
  }

  // ---- OAuth ----

  async oauthLogin(providerName: string, credential: string, ctx: ClientContext) {
    const profile = await getOAuthProvider(providerName).verify(credential)
    const user = await this.findOrCreateOAuthUser(profile)
    return this.startSession(user, ctx)
  }

  private async findOrCreateOAuthUser(profile: OAuthProfile) {
    const account = await this.authRepository.findOAuthAccount(
      profile.provider,
      profile.providerAccountId,
    )
    if (account) return account.user

    if (!profile.email || !profile.emailVerified) {
      throw new AppError(
        `Your ${profile.provider} account has no verified email address`,
        400,
        'OAUTH_EMAIL_UNVERIFIED',
      )
    }

    // Same verified email as an existing user: link instead of creating a duplicate
    const existing = await this.usersRepository.findByEmail(profile.email)
    if (existing) return this.authRepository.linkOAuthAccount(existing, profile)

    return this.authRepository.createUserWithOAuthAccount({ ...profile, email: profile.email })
  }

  /** Signing in to a closed account restores it, unless its grace period is over */
  private async startSession(user: User, ctx: ClientContext) {
    let restored = false
    if (user.closedAt) {
      if (deletionDate(user.closedAt) < new Date()) {
        throw new AppError('This account was closed and has been deleted', 410, 'ACCOUNT_DELETED')
      }
      user = await this.usersRepository.update(user.id, { closedAt: null })
      restored = true
    }
    const tokens = await this.tokenService.issue(user, ctx)
    return { user: toPublicUser(user), ...tokens, restored }
  }
}
