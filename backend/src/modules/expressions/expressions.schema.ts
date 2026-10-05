import { z } from 'zod'
import { EMOTION_IDS, MAX_DIRECTION_CHARS, NARRATION_STRENGTH_IDS, NARRATION_STYLE_IDS, SOUND_IDS } from './expression-catalog.js'

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
        .object({
          start: offset,
          end: offset,
          emotion: z.enum(EMOTION_IDS),
          strong: z.boolean().optional(),
          direction: z.string().max(MAX_DIRECTION_CHARS * 2).optional(),
          ai: z.boolean().optional(),
        })
        .refine((m) => m.end > m.start, 'An emotion needs at least one character'),
    )
    .max(80),
  sounds: z.array(z.object({ at: offset, sound: z.enum(SOUND_IDS), ai: z.boolean().optional() })).max(40),
})

/** How the whole document is narrated; null style turns it off */
export const narrationBodySchema = z.preprocess(
  // Older app versions start "Make it expressive" without a body (Fastify passes null)
  (body) => body ?? {},
  z.object({
    style: z.enum([...NARRATION_STYLE_IDS, 'auto']).nullable().default('auto'),
    strength: z.enum(NARRATION_STRENGTH_IDS).default('balanced'),
  }),
)

export const describeBodySchema = z
  .object({ start: offset, end: offset, description: z.string().trim().min(2).max(300) })
  .refine((b) => b.end > b.start, 'Choose some words to direct')

export const clearQuerySchema = z.object({
  /** "ai" removes only suggestions from "Make it expressive" */
  only: z.enum(['ai', 'all']).default('all'),
})

export type DocumentParams = z.infer<typeof documentParamsSchema>
export type ChunkParams = z.infer<typeof chunkParamsSchema>
export type ChunkExpressionsBody = z.infer<typeof chunkExpressionsBodySchema>
export type ClearQuery = z.infer<typeof clearQuerySchema>
export type NarrationBody = z.infer<typeof narrationBodySchema>
export type DescribeBody = z.infer<typeof describeBodySchema>
