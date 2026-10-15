import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
import { AppError } from '../../utils/AppError.js'
import { emailKey } from '../../utils/email-key.js'
import { getIP } from '../../utils/getIp.js'
import { UsersRepository } from '../users/users.repository.js'
import { AuthRepository } from './auth.repository.js'
import { AuthService } from './auth.service.js'
import { AuthController } from './auth.controller.js'
import { TokenService } from './token.service.js'
import { OtpService } from './otp.service.js'
import {
  emailOtpSchema,
  emailSchema,
  loginSchema,
  oauthBodySchema,
  oauthParamsSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schema.js'

// Per-IP limits; kept moderate since mobile carriers put many users behind one IP
const credentialLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } }
const sessionLimit = { rateLimit: { max: 30, timeWindow: '1 minute' } }

// Per-address limits on top, counted per email *and* IP together: one network can't keep
// guessing at an account or flood an inbox with codes, and someone who knows your email
// can't lock you out from your own network by failing from theirs. Keyed by inbox, so
// Gmail dots don't help
const LOGIN_FAILURES = { max: 10, timeWindow: '15 minutes' }
const EMAILS_SENT = { max: 5, timeWindow: '1 hour' }

const addressKey = (name: string) => (request: FastifyRequest) =>
  `${name}:${emailKey((request.body as { email: string }).email)}:${getIP(request)}`
const tooManyTries = (seconds: number) =>
  new AppError(`Too many tries with this email. Try again in ${Math.max(1, Math.ceil(seconds / 60))} minutes.`, 429, 'TOO_MANY_ATTEMPTS')

const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const usersRepository = new UsersRepository(prisma)
  const authRepository = new AuthRepository(prisma)
  const tokenService = new TokenService(app.jwt, authRepository)
  const otpService = new OtpService(authRepository)
  const authService = new AuthService(usersRepository, authRepository, tokenService, otpService, app.jwt)
  const controller = new AuthController(authService)

  /** Counts every request for the address; refuses once there were too many */
  const perAddress = (name: string) => {
    const limit = app.createRateLimit({ ...EMAILS_SENT, keyGenerator: addressKey(name) })
    return async (request: FastifyRequest) => {
      const result = await limit(request)
      if (!result.isAllowed && result.isExceeded) throw tooManyTries(result.ttlInSeconds)
    }
  }
  // Only wrong passwords count
  const loginFailures = app.createRateLimit({ ...LOGIN_FAILURES, keyGenerator: addressKey('login') })
  const loginGuard = {
    preHandler: async (request: FastifyRequest) => {
      const result = await loginFailures(request, { increment: false })
      if (!result.isAllowed && result.remaining <= 0) throw tooManyTries(result.ttlInSeconds)
    },
    onResponse: async (request: FastifyRequest, reply: { statusCode: number }) => {
      if (reply.statusCode === 401) await loginFailures(request)
    },
  }

  // Email + password
  app.post('/register', { schema: { body: registerSchema }, config: credentialLimit, preHandler: perAddress('register') }, controller.register)
  app.post('/verify-email', { schema: { body: verifyEmailSchema }, config: credentialLimit }, controller.verifyEmail)
  app.post('/resend-verification', { schema: { body: emailSchema }, config: credentialLimit, preHandler: perAddress('resend') }, controller.resendVerification)
  app.post('/login', { schema: { body: loginSchema }, config: credentialLimit, ...loginGuard }, controller.login)

  // Sessions
  app.post('/refresh', { schema: { body: refreshTokenSchema }, config: sessionLimit }, controller.refresh)
  app.post('/logout', { schema: { body: refreshTokenSchema }, config: sessionLimit }, controller.logout)
  app.post('/logout-all', { preHandler: app.verifyAccess }, controller.logoutAll)

  // Password reset
  app.post('/password/forgot', { schema: { body: emailSchema }, config: credentialLimit, preHandler: perAddress('forgot') }, controller.forgotPassword)
  app.post('/password/verify-otp', { schema: { body: emailOtpSchema }, config: credentialLimit }, controller.verifyResetOtp)
  app.post('/password/reset', { schema: { body: resetPasswordSchema }, config: credentialLimit }, controller.resetPassword)

  // OAuth: the app signs in with the provider SDK and posts the credential here
  app.get('/oauth/providers', controller.oauthProviders)
  app.post(
    '/oauth/:provider',
    { schema: { params: oauthParamsSchema, body: oauthBodySchema }, config: credentialLimit },
    controller.oauthLogin,
  )
}

export default authRoutes
