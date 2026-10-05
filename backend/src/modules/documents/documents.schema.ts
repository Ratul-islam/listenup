import { z } from 'zod'
import { MAX_PASTE_CHARS } from '../../config/constants.js'
import { LANGS } from '../ingestion/text/language.js'

/** Language picked at import; "auto" (or nothing) detects it */
const languageField = z.enum(['auto', ...LANGS]).optional()

export const CATEGORIES = ['all', 'books', 'articles', 'notes', 'scans'] as const

export const listQuerySchema = z.object({
  category: z.enum(CATEGORIES).default('all'),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['recent', 'title', 'progress']).default('recent'),
  /** Only what's loose on the shelf ("root") or inside one folder; omit to search everything */
  folder: z.union([z.literal('root'), z.uuid()]).optional(),
})

export const idParamsSchema = z.object({ id: z.uuid() })

/** Step 1 of an upload: what the phone is about to send */
export const uploadStartSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  /** Bytes; the signed upload link only accepts exactly this size */
  size: z.number().int().positive(),
})

/** Step 2: the file is in storage */
export const uploadCompleteSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  language: languageField,
})

export const uploadParamsSchema = z.object({ uploadId: z.uuid() })

export const textBodySchema = z.object({
  title: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1, 'Add some text to listen to').max(MAX_PASTE_CHARS),
  language: languageField,
})

export const urlBodySchema = z.object({
  url: z.url('Enter a full link, starting with https://').max(2000),
  language: languageField,
})

export const updateBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    /** Move into a folder, or null to put it back on the shelf */
    folderId: z.uuid().nullable().optional(),
  })
  .refine((v) => v.title !== undefined || v.folderId !== undefined, 'Nothing to update')

export const reprocessBodySchema = z.object({
  ocr: z.boolean().default(false),
  /** Change whether citations, links and reference lists are read aloud */
  keepClutter: z.boolean().optional(),
})

export const digestBodySchema = z.object({
  /** The listener's local date, so "today" follows their calendar */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
})

export const translateBodySchema = z.object({ language: z.enum(LANGS) })

export const readerQuerySchema = z.object({
  voiceId: z.string().max(64).optional(),
})

export type ListQuery = z.infer<typeof listQuerySchema>
export type TextBody = z.infer<typeof textBodySchema>
export type UrlBody = z.infer<typeof urlBodySchema>
export type UpdateBody = z.infer<typeof updateBodySchema>
export type ReprocessBody = z.infer<typeof reprocessBodySchema>
export type IdParams = z.infer<typeof idParamsSchema>
export type UploadStartBody = z.infer<typeof uploadStartSchema>
export type UploadCompleteBody = z.infer<typeof uploadCompleteSchema>
export type UploadParams = z.infer<typeof uploadParamsSchema>
export type ReaderQuery = z.infer<typeof readerQuerySchema>
export type TranslateBody = z.infer<typeof translateBodySchema>
export type DigestBody = z.infer<typeof digestBodySchema>
