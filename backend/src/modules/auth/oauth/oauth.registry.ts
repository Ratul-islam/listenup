import { env } from '../../../config/env.js'
import { AppError } from '../../../utils/AppError.js'
import type { OAuthProvider } from './oauth.provider.js'
import { GoogleOAuthProvider } from './google.provider.js'

const providers = new Map<string, OAuthProvider>()

function register(provider: OAuthProvider) {
  providers.set(provider.name, provider)
}

// Providers are enabled only when their credentials are configured
if (env.GOOGLE_CLIENT_ID) register(new GoogleOAuthProvider(env.GOOGLE_CLIENT_ID))

export function getOAuthProvider(name: string): OAuthProvider {
  const provider = providers.get(name)
  if (!provider) {
    throw new AppError(`Sign-in with "${name}" is not supported`, 404, 'OAUTH_PROVIDER_NOT_FOUND')
  }
  return provider
}

export function listOAuthProviders() {
  return [...providers.keys()]
}
