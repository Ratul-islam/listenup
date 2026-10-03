import { z } from 'zod'
import { OTP_LENGTH } from '../../config/constants.js'

const email = z.string().trim().toLowerCase().pipe(z.email())
const password = z.string().min(8, 'Password must be at least 8 characters').max(128)
const otp = z.string().trim().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Code must be ${OTP_LENGTH} digits`)

export const registerSchema = z.object({
  email,
  password,
  name: z.string().trim().min(1).max(100).optional(),
})

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
})

export const emailSchema = z.object({ email })

export const emailOtpSchema = z.object({ email, otp })

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
})

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(1),
  password,
})

export const oauthParamsSchema = z.object({
  provider: z.string().min(1).max(32),
})

export const oauthBodySchema = z.object({
  // Credential from the provider SDK on the device, e.g. Google ID token
  token: z.string().min(1),
})

export type RegisterBody = z.infer<typeof registerSchema>
export type LoginBody = z.infer<typeof loginSchema>
export type EmailBody = z.infer<typeof emailSchema>
export type EmailOtpBody = z.infer<typeof emailOtpSchema>
export type RefreshTokenBody = z.infer<typeof refreshTokenSchema>
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>
export type OAuthParams = z.infer<typeof oauthParamsSchema>
export type OAuthBody = z.infer<typeof oauthBodySchema>
