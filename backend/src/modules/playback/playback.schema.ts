import { z } from 'zod'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const documentParamsSchema = z.object({ documentId: z.uuid() })

export const chunkParamsSchema = z.object({
  documentId: z.uuid(),
  index: z.coerce.number().int().min(0),
})

export const audioQuerySchema = z.object({ voiceId: z.string().max(64).optional() })

export const progressBodySchema = z.object({
  chunkIndex: z.number().int().min(0),
  offsetMs: z.number().int().min(0),
  voiceId: z.string().max(64).optional(),
  speed: z.number().min(0.5).max(3).optional(),
  /** Seconds actually listened since the last report */
  listenedSec: z.number().min(0).max(24 * 3600).default(0),
  /** Listener's local date, so streaks follow their calendar */
  day,
  completed: z.boolean().optional(),
})

export const statsQuerySchema = z.object({ day })

export const bookmarkBodySchema = z.object({
  chunkIndex: z.number().int().min(0),
  offsetMs: z.number().int().min(0).default(0),
  label: z.string().trim().max(200).optional(),
})

/** A sentence or paragraph to send as a voice note: character offsets within one chunk */
export const voiceNoteBodySchema = z
  .object({
    chunkIndex: z.number().int().min(0),
    start: z.number().int().min(0),
    end: z.number().int().min(1),
    voiceId: z.string().max(64).optional(),
  })
  .refine((v) => v.end > v.start, 'Pick some text')

export const bookmarkParamsSchema = z.object({ documentId: z.uuid(), bookmarkId: z.uuid() })

export type DocumentParams = z.infer<typeof documentParamsSchema>
export type ChunkParams = z.infer<typeof chunkParamsSchema>
export type AudioQuery = z.infer<typeof audioQuerySchema>
export type ProgressBody = z.infer<typeof progressBodySchema>
export type StatsQuery = z.infer<typeof statsQuerySchema>
export type VoiceNoteBody = z.infer<typeof voiceNoteBodySchema>
export type BookmarkBody = z.infer<typeof bookmarkBodySchema>
export type BookmarkParams = z.infer<typeof bookmarkParamsSchema>
