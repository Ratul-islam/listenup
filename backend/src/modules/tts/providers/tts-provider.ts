import type { VoiceDefinition } from '../../voices/voice-catalog.js'

export interface SynthesisRequest {
  /** May contain inline sound tags ("<laugh>") for expressive voices */
  text: string
  voice: VoiceDefinition
  /** Delivery direction for expressive voices ("sad and tearful, in a British English accent") */
  style?: string
}

export interface SynthesisResult {
  audio: Buffer
  /** Exact length when the provider knows it (otherwise measured from the file) */
  durationMs?: number
  mimeType: string
  extension: string
  provider: string
  model: string
}

/** A speech backend. Add a provider by implementing this and wiring it in createTtsProvider(). */
export interface TtsProvider {
  readonly name: string
  readonly billable: boolean
  synthesize(req: SynthesisRequest): Promise<SynthesisResult>
}
