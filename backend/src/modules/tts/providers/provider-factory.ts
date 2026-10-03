import { ttsProviderName } from '../../../config/env.js'
import { MockTtsProvider } from './mock.provider.js'
import { OpenRouterTtsProvider } from './openrouter.provider.js'
import type { TtsProvider } from './tts-provider.js'

export function createTtsProvider(): TtsProvider {
  return ttsProviderName === 'openrouter' ? new OpenRouterTtsProvider() : new MockTtsProvider()
}
