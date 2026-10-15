import { z } from 'zod'
import { LANGS } from '../ingestion/text/language.js'

export const uploadStartSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
})

export const createSchema = z.object({
  uploadId: z.uuid(),
  fileName: z.string().trim().min(1).max(255),
  /** The language to translate into */
  to: z.enum(LANGS),
})

export const translationParamsSchema = z.object({ documentId: z.uuid() })

export const consentSchema = z.object({
  /** The speaker reading Google's consent sentence: an .m4a (or any audio), base64 */
  consent: z.string().min(1).max(4_000_000),
  /** The language of the consent sentence they read */
  language: z.enum(LANGS),
  confirm: z.object({
    /** The listener confirms the speaker agreed to have their voice cloned */
    speakerAgreed: z.literal(true),
    notInRestrictedState: z.boolean().default(false),
  }),
})

export type UploadStartBody = z.infer<typeof uploadStartSchema>
export type CreateBody = z.infer<typeof createSchema>
export type TranslationParams = z.infer<typeof translationParamsSchema>
export type ConsentBody = z.infer<typeof consentSchema>
