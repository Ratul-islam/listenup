import { z } from 'zod'
import { MAX_PASTE_CHARS } from '../../config/constants.js'

export const CATEGORIES = ['all', 'books', 'articles', 'notes', 'scans'] as const

export const listQuerySchema = z.object({
  category: z.enum(CATEGORIES).default('all'),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['recent', 'title', 'progress']).default('recent'),
  /** Only what's loose on the shelf ("root") or inside one folder; omit to search everything */
  folder: z.union([z.literal('root'), z.uuid()]).optional(),
})

export const idParamsSchema = z.object({ id: z.uuid() })

export const textBodySchema = z.object({
  title: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1, 'Add some text to listen to').max(MAX_PASTE_CHARS),
})

export const urlBodySchema = z.object({
  url: z.url('Enter a full link, starting with https://').max(2000),
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
})

export const readerQuerySchema = z.object({
  voiceId: z.string().max(64).optional(),
})

export type ListQuery = z.infer<typeof listQuerySchema>
export type TextBody = z.infer<typeof textBodySchema>
export type UrlBody = z.infer<typeof urlBodySchema>
export type UpdateBody = z.infer<typeof updateBodySchema>
export type ReprocessBody = z.infer<typeof reprocessBodySchema>
export type IdParams = z.infer<typeof idParamsSchema>
export type ReaderQuery = z.infer<typeof readerQuerySchema>
