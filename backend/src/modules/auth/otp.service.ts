import type { OtpPurpose } from '../../generated/prisma/client.js'
import {
  OTP_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
} from '../../config/constants.js'
import { AppError } from '../../utils/AppError.js'
import { generateOtp, safeEqual, sha256 } from '../../utils/util.js'
import type { AuthRepository } from './auth.repository.js'

export const invalidOtp = () => new AppError('Invalid or expired code', 400, 'INVALID_OTP')

export class OtpService {
  constructor(private readonly authRepository: AuthRepository) {}

  // Creates a fresh code (invalidating older ones) and returns it for emailing
  async issue(userId: string, purpose: OtpPurpose) {
    const latest = await this.authRepository.findLatestOtp(userId, purpose)
    if (latest) {
      const waitMs = latest.createdAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000 - Date.now()
      if (waitMs > 0) {
        throw new AppError(
          `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code`,
          429,
          'OTP_COOLDOWN',
        )
      }
    }

    await this.authRepository.deleteOtps(userId, purpose)

    const code = generateOtp(OTP_LENGTH)
    await this.authRepository.createOtp({
      userId,
      purpose,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    })
    return code
  }

  // Checks a code against the latest one issued; does not consume it
  async verify(userId: string, purpose: OtpPurpose, code: string) {
    const otp = await this.authRepository.findLatestOtp(userId, purpose)
    if (!otp || otp.consumedAt || otp.expiresAt <= new Date()) throw invalidOtp()

    // Count the attempt before comparing so parallel guesses can't exceed the limit
    if (!(await this.authRepository.claimOtpAttempt(otp.id))) {
      throw new AppError('Too many attempts, please request a new code', 429, 'OTP_ATTEMPTS_EXCEEDED')
    }
    if (!safeEqual(otp.codeHash, sha256(code))) throw invalidOtp()

    return otp
  }

  async consume(otpId: string) {
    if (!(await this.authRepository.consumeOtp(otpId))) throw invalidOtp()
  }
}
