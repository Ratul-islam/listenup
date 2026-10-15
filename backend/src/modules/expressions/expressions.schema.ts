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
          // "Say it yourself": which kept performance these words are shaped to (the app sends back what it was given)
          shape: z.object({ id: z.string().max(40), of: z.string().max(16), in: z.string().max(80) }).optional(),
        })
        .refine((m) => m.end > m.start, 'An emotion needs at least one character'),
    )
    .max(80),
  sounds: z.array(z.object({ at: offset, sound: z.enum(SOUND_IDS), ai: z.boolean().optional() })).max(40),
  /** Who says which words. Left out by app versions from before characters had voices; the part then keeps the ones it has */
  speakers: z
    .array(
      z
        .object({
          start: offset,
          end: offset,
          name: z.string().trim().min(1).max(60),
          gender: z.enum(['female', 'male']).optional(),
          rank: z.number().int().min(0).max(50),
          voiceId: z.string().max(64).optional(),
          manner: z.string().max(MAX_DIRECTION_CHARS * 2).optional(),
          ai: z.boolean().optional(),
        })
        .refine((m) => m.end > m.start, 'A line needs at least one character'),
    )
    .max(80)
    .optional(),
})

/** The voice a character reads in; null goes back to the automatic one */
export const castBodySchema = z.object({ name: z.string().trim().min(1).max(60), voiceId: z.string().max(64).nullable() })

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

/** "Say it yourself": the listener's recording of these words, base64 (the phone's .m4a; under a minute is well under 1 MB) */
export const deliveryBodySchema = z
  .object({ start: offset, end: offset, recording: z.string().min(1000).max(3_000_000) })
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
export type DeliveryBody = z.infer<typeof deliveryBodySchema>
export type CastBody = z.infer<typeof castBodySchema>
