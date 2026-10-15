import { z } from 'zod'
import { LANGS } from '../ingestion/text/language.js'

// About 3 MB of audio as base64: half a minute from a phone is well under 1 MB
const recording = z.string().min(1000).max(4_000_000)

export const recordBodySchema = z.object({
  /** The language the scripts were read in */
  language: z.enum(LANGS),
  /** The reading the voice is made from, base64 (the phone's .m4a) */
  source: recording,
  /** The consent sentence, said by the same person, base64 */
  consent: recording,
  /** What the speaker ticked before recording */
  confirm: z.object({
    ownVoice: z.literal(true),
    adult: z.literal(true),
    /** Asked in the United States only */
    notInRestrictedState: z.boolean().optional(),
  }),
})

export type RecordBody = z.infer<typeof recordBodySchema>
