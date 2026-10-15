import type { VoiceAdjust } from '../../../lib/audio/adjust.js'
import type { Prosody } from '../../../lib/audio/prosody.js'
import type { VoiceDefinition } from '../../voices/voice-catalog.js'

/**
 * A delivery whose result can be measured in the audio, so a take that missed
 * it is made again: a whisper has almost no voice in it, an angry or shouted
 * line comes back louder, a sad or frightened one slower.
 */
export type DeliveryCheck = 'whisper' | 'loud' | 'slow'

/**
 * "Say it yourself": a listener's own performance of some of a take's words,
 * which the take is shaped to (its timing, stops, tune and stress; see reshape)
 */
export interface ShapeUse {
  /** The kept performance, and the document it's kept with (see performanceKey) */
  id: string
  in: string
  /** Where the performed words lie among the take's words, as shares of them: 0 to 1 when they're all of it */
  from: number
  to: number
  /** Its measurements, read from storage when the speech is about to be made */
  said?: Prosody
}

/** What's asked of one take beyond its words */
export interface Delivery {
  /** Delivery direction for expressive voices ("sad and tearful, in a British English accent") */
  style?: string
  /** Make sure the delivery took (voices follow a style only some of the time) */
  check?: DeliveryCheck
  /** The most takes made for `check` before the best is kept */
  tries?: number
  /** How far above or below the usual speech level it's left, in dB: a shout stays louder, a whisper quieter */
  levelDb?: number
  /** The listener's performance it's shaped to */
  shape?: ShapeUse
}

/** A run of the text said one way, voiced on its own and joined to the runs around it */
export interface SpeechSegment extends Delivery {
  /** May contain inline sound tags, like the whole text */
  text: string
  /** Silence before this run, on top of the little each clip keeps at its ends */
  gapMs: number
  /** Who reads this run, when it isn't the request's voice: a character's lines */
  voice?: VoiceDefinition
  /** Where this run starts in the text as written, so the player knows what's being said after each join */
  at: number
}

/** Where a run of joined speech starts: in the text as written, and in the audio */
export interface SpeechJoin {
  at: number
  ms: number
}

export interface SynthesisRequest extends Delivery {
  /** May contain inline sound tags ("<laugh>") for expressive voices */
  text: string
  voice: VoiceDefinition
  /** The text as runs said differently (a whispered line inside narration); they replace `text` and `style` */
  segments?: SpeechSegment[]
  /** Nobody is waiting for it (MP3 exports, offline downloads), so a cheaper, slower tier may be used */
  background?: boolean
  /** The script's pace and pitch (Studio), applied to every take before they're joined */
  adjust?: VoiceAdjust
}

/** Where the audio was made, which decides what it cost */
export type SpeechRoute = 'openrouter' | 'google' | 'google-flex' | 'vertex' | 'local'

export interface SynthesisResult {
  audio: Buffer
  /** Exact length when the provider knows it (otherwise measured from the file) */
  durationMs?: number
  /** All the speech that was made for it, takes that weren't kept included: what it cost follows this */
  madeMs?: number
  mimeType: string
  extension: string
  provider: string
  model: string
  route?: SpeechRoute
  /** Speech made of several runs: where each one after the first starts */
  joins?: SpeechJoin[]
}

/** A speech backend. Add a provider by implementing this and wiring it in createTtsProvider(). */
export interface TtsProvider {
  readonly name: string
  readonly billable: boolean
  synthesize(req: SynthesisRequest): Promise<SynthesisResult>
}
