import type { JWTPayload } from 'jose'
import { AppError } from '../../../utils/AppError.js'
import { OidcProvider, type OAuthProfile } from './oauth.provider.js'

interface GoogleIdTokenClaims extends JWTPayload {
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}

export class GoogleOAuthProvider extends OidcProvider {
  readonly name = 'google'

  // clientId is the Web client ID the Android app passes as serverClientId
  constructor(clientId: string) {
    super({
      jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
    })
  }

  protected toProfile(claims: GoogleIdTokenClaims): OAuthProfile {
    if (!claims.sub) throw new AppError('Invalid google token', 401, 'OAUTH_INVALID_TOKEN')

    return {
      provider: this.name,
      providerAccountId: claims.sub,
      email: claims.email?.toLowerCase() ?? null,
      emailVerified: claims.email_verified === true,
      name: claims.name ?? null,
      avatarUrl: claims.picture ?? null,
    }
  }
}
