import type { FastifyReply, FastifyRequest } from 'fastify'
import { getIP } from '../../utils/getIp.js'
import { sendSuccess } from '../../utils/responses.js'
import type { AuthService } from './auth.service.js'
import type { ClientContext } from './token.service.js'
import type {
  EmailBody,
  EmailOtpBody,
  LoginBody,
  OAuthBody,
  OAuthParams,
  RefreshTokenBody,
  RegisterBody,
  ResetPasswordBody,
} from './auth.schema.js'
import { listOAuthProviders } from './oauth/oauth.registry.js'

const clientContext = (request: FastifyRequest): ClientContext => ({
  ip: getIP(request),
  userAgent: request.headers['user-agent'],
})

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
    await this.authService.register(request.body)
    return sendSuccess(reply, {
      statusCode: 201,
      message: 'Account created. Enter the code sent to your email to verify it.',
    })
  }

  verifyEmail = async (request: FastifyRequest<{ Body: EmailOtpBody }>, reply: FastifyReply) => {
    const session = await this.authService.verifyEmail(request.body, clientContext(request))
    return sendSuccess(reply, { message: 'Email verified', data: session })
  }

  resendVerification = async (request: FastifyRequest<{ Body: EmailBody }>, reply: FastifyReply) => {
    await this.authService.resendVerification(request.body)
    return sendSuccess(reply, {
      message: 'If the account exists and is unverified, a new code has been sent',
    })
  }

  login = async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const session = await this.authService.login(request.body, clientContext(request))
    return sendSuccess(reply, { message: session.restored ? 'Welcome back. Your account has been restored.' : 'Logged in', data: session })
  }

  refresh = async (request: FastifyRequest<{ Body: RefreshTokenBody }>, reply: FastifyReply) => {
    const session = await this.authService.refresh(request.body.refreshToken, clientContext(request))
    return sendSuccess(reply, { message: 'Token refreshed', data: session })
  }

  logout = async (request: FastifyRequest<{ Body: RefreshTokenBody }>, reply: FastifyReply) => {
    await this.authService.logout(request.body.refreshToken)
    return sendSuccess(reply, { message: 'Logged out' })
  }

  logoutAll = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.authService.logoutAll(request.user.sub)
    return sendSuccess(reply, { message: 'Logged out from all devices' })
  }

  forgotPassword = async (request: FastifyRequest<{ Body: EmailBody }>, reply: FastifyReply) => {
    await this.authService.forgotPassword(request.body)
    return sendSuccess(reply, {
      message: 'If an account exists for this email, a reset code has been sent',
    })
  }

  verifyResetOtp = async (request: FastifyRequest<{ Body: EmailOtpBody }>, reply: FastifyReply) => {
    const data = await this.authService.verifyResetOtp(request.body)
    return sendSuccess(reply, { message: 'Code verified', data })
  }

  resetPassword = async (request: FastifyRequest<{ Body: ResetPasswordBody }>, reply: FastifyReply) => {
    await this.authService.resetPassword(request.body)
    return sendSuccess(reply, { message: 'Password updated. Please log in again.' })
  }

  oauthProviders = async (_request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, { data: { providers: listOAuthProviders() } })
  }

  oauthLogin = async (
    request: FastifyRequest<{ Params: OAuthParams; Body: OAuthBody }>,
    reply: FastifyReply,
  ) => {
    const session = await this.authService.oauthLogin(
      request.params.provider,
      request.body.token,
      clientContext(request),
    )
    return sendSuccess(reply, { message: session.restored ? 'Welcome back. Your account has been restored.' : 'Logged in', data: session })
  }
}
