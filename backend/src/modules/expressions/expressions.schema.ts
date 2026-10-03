import { z } from 'zod'
import { EMOTION_IDS, SOUND_IDS } from './expression-catalog.js'

const offset = z.number().int().min(0)

export const documentParamsSchema = z.object({ documentId: z.uuid() })

export const chunkParamsSchema = z.object({
  documentId: z.uuid(),
  index: z.coerce.number().int().min(0),
})

export const chunkExpressionsBodySchema = z.object({
  emotions: z
    .array(
      z
        .object({ start: offset, end: offset, emotion: z.enum(EMOTION_IDS), ai: z.boolean().optional() })
        .refine((m) => m.end > m.start, 'An emotion needs at least one character'),
    )
    .max(80),
  sounds: z.array(z.object({ at: offset, sound: z.enum(SOUND_IDS), ai: z.boolean().optional() })).max(40),
})

export const clearQuerySchema = z.object({
  /** "ai" removes only suggestions from "Make it expressive" */
  only: z.enum(['ai', 'all']).default('all'),
})

export type DocumentParams = z.infer<typeof documentParamsSchema>
export type ChunkParams = z.infer<typeof chunkParamsSchema>
export type ChunkExpressionsBody = z.infer<typeof chunkExpressionsBodySchema>
export type ClearQuery = z.infer<typeof clearQuerySchema>
