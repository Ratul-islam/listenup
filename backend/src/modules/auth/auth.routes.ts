import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../../config/db.js'
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
} from './auth.schema.js'

// Per-IP limits; kept moderate since mobile carriers put many users behind one IP
const credentialLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } }
const sessionLimit = { rateLimit: { max: 30, timeWindow: '1 minute' } }

const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const usersRepository = new UsersRepository(prisma)
  const authRepository = new AuthRepository(prisma)
  const tokenService = new TokenService(app.jwt, authRepository)
  const otpService = new OtpService(authRepository)
  const authService = new AuthService(usersRepository, authRepository, tokenService, otpService, app.jwt)
  const controller = new AuthController(authService)

  // Email + password
  app.post('/register', { schema: { body: registerSchema }, config: credentialLimit }, controller.register)
  app.post('/verify-email', { schema: { body: emailOtpSchema }, config: credentialLimit }, controller.verifyEmail)
  app.post('/resend-verification', { schema: { body: emailSchema }, config: credentialLimit }, controller.resendVerification)
  app.post('/login', { schema: { body: loginSchema }, config: credentialLimit }, controller.login)

  // Sessions
  app.post('/refresh', { schema: { body: refreshTokenSchema }, config: sessionLimit }, controller.refresh)
  app.post('/logout', { schema: { body: refreshTokenSchema }, config: sessionLimit }, controller.logout)
  app.post('/logout-all', { preHandler: app.verifyAccess }, controller.logoutAll)

  // Password reset
  app.post('/password/forgot', { schema: { body: emailSchema }, config: credentialLimit }, controller.forgotPassword)
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
