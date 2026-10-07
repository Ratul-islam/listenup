import { z } from 'zod'
import { LANGS } from '../ingestion/text/language.js'

export const MAX_PRONUNCIATIONS = 500

const word = z
  .string()
  .trim()
  .min(1, 'Type the word as it is written')
  .max(60)
  .refine((w) => /[\p{L}\p{N}]/u.test(w), 'Type the word as it is written')
const sayAs = z.string().trim().min(1, 'Spell how it should sound').max(120)

export const pronunciationBodySchema = z.object({ word, sayAs })

export const pronunciationUpdateSchema = z
  .object({ word: word.optional(), sayAs: sayAs.optional() })
  .refine((v) => v.word !== undefined || v.sayAs !== undefined, 'Nothing to update')

export const pronunciationParamsSchema = z.object({ id: z.uuid() })

/** "Hear it": the respelling in the voice that reads this language */
export const previewBodySchema = z.object({
  sayAs,
  language: z.enum(LANGS).optional(),
  voiceId: z.string().max(64).optional(),
})

export type PronunciationBody = z.infer<typeof pronunciationBodySchema>
export type PronunciationUpdate = z.infer<typeof pronunciationUpdateSchema>
export type PronunciationParams = z.infer<typeof pronunciationParamsSchema>
export type PreviewBody = z.infer<typeof previewBodySchema>
