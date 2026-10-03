import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose'
import { AppError } from '../../../utils/AppError.js'

export interface OAuthProfile {
  provider: string
  providerAccountId: string
  email: string | null
  emailVerified: boolean
  name: string | null
  avatarUrl: string | null
}

// A sign-in provider verifies a credential the mobile app obtained from the
// provider's SDK (an ID token, access token, ...) and returns who the user is.
// To add a provider: implement this interface (or extend OidcProvider) and
// register it in oauth.registry.ts.
export interface OAuthProvider {
  readonly name: string
  verify(credential: string): Promise<OAuthProfile>
}

export interface OidcProviderConfig {
  jwksUrl: string
  issuer: string | string[]
  audience: string | string[]
}

// Base for providers that issue OpenID Connect ID tokens (Google, Apple, ...):
// the token's signature, issuer, audience and expiry are checked against the
// provider's published keys, then subclasses map the claims to a profile.
export abstract class OidcProvider implements OAuthProvider {
  abstract readonly name: string
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>

  constructor(private readonly config: OidcProviderConfig) {
    this.jwks = createRemoteJWKSet(new URL(config.jwksUrl))
  }

  async verify(idToken: string): Promise<OAuthProfile> {
    try {
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      })
      return this.toProfile(payload)
    } catch (err) {
      if (err instanceof errors.JWKSTimeout) {
        throw new AppError(`Could not reach ${this.name} to verify sign-in`, 503, 'OAUTH_PROVIDER_UNAVAILABLE')
      }
      if (err instanceof AppError) throw err
      throw new AppError(`Invalid ${this.name} token`, 401, 'OAUTH_INVALID_TOKEN')
    }
  }

  protected abstract toProfile(claims: JWTPayload): OAuthProfile
}
