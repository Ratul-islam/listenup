import { z } from 'zod'
import { MAX_PASTE_CHARS } from '../../config/constants.js'
import { LANGS } from '../ingestion/text/language.js'

/** Language picked at import; "auto" (or nothing) detects it */
const languageField = z.enum(['auto', ...LANGS]).optional()

export const CATEGORIES = ['all', 'books', 'articles', 'notes', 'scans'] as const

export const listQuerySchema = z.object({
  /** The Soundshelf (everything but scripts) or Studio's scripts */
  view: z.enum(['shelf', 'scripts']).default('shelf'),
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

/** A creator's script goes to Studio instead of the Soundshelf */
const scriptField = z.boolean().default(false)

/**
 * One way to add anything: pasted text, a web link, a file already uploaded
 * (step 2 of an upload), or today's digest.
 */
export const createBodySchema = z.discriminatedUnion('from', [
  z.object({
    from: z.literal('text'),
    title: z.string().trim().max(200).optional(),
    text: z.string().trim().min(1, 'Add some text to listen to').max(MAX_PASTE_CHARS),
    language: languageField,
    script: scriptField,
  }),
  z.object({
    from: z.literal('url'),
    url: z.url('Enter a full link, starting with https://').max(2000),
    language: languageField,
    script: scriptField,
  }),
  z.object({
    from: z.literal('upload'),
    uploadId: z.uuid(),
    fileName: z.string().trim().min(1).max(255),
    language: languageField,
    script: scriptField,
  }),
  z.object({
    from: z.literal('digest'),
    /** The listener's local date, so "today" follows their calendar */
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  }),
])

export const updateBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    /** Move into a folder, or null to put it back on the shelf */
    folderId: z.uuid().nullable().optional(),
    /** Move to Studio as a script, or back to the Soundshelf */
    script: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.folderId !== undefined || v.script !== undefined, 'Nothing to update')

export const reprocessBodySchema = z.object({
  ocr: z.boolean().default(false),
  /** Change whether citations, links and reference lists are read aloud */
  keepClutter: z.boolean().optional(),
})

export const translateBodySchema = z.object({ language: z.enum(LANGS) })

export const scriptQuerySchema = z.object({
  voiceId: z.string().max(64).optional(),
})

export type ListQuery = z.infer<typeof listQuerySchema>
export type CreateBody = z.infer<typeof createBodySchema>
export type TextBody = Extract<CreateBody, { from: 'text' }>
export type UrlBody = Extract<CreateBody, { from: 'url' }>
export type UploadCompleteBody = Extract<CreateBody, { from: 'upload' }>
export type DigestBody = Extract<CreateBody, { from: 'digest' }>
export type UpdateBody = z.infer<typeof updateBodySchema>
export type ReprocessBody = z.infer<typeof reprocessBodySchema>
export type IdParams = z.infer<typeof idParamsSchema>
export type UploadStartBody = z.infer<typeof uploadStartSchema>
export type ScriptQuery = z.infer<typeof scriptQuerySchema>
export type TranslateBody = z.infer<typeof translateBodySchema>
