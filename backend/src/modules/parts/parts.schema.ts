import { z } from 'zod'
import { chunkExpressionsBodySchema } from '../expressions/expressions.schema.js'

// An edited part may grow; anything longer than a part is split into several
export const MAX_PART_EDIT_CHARS = 5000
export const MAX_PAUSE_MS = 10_000

export const documentParamsSchema = z.object({ documentId: z.uuid() })

export const partParamsSchema = z.object({
  documentId: z.uuid(),
  index: z.coerce.number().int().min(0),
})

const partText = z.string().trim().min(1, "A part can't be empty. Delete it instead.").max(MAX_PART_EDIT_CHARS, 'That is a lot for one part. Add it as new parts instead.')

/** New words for the part, and/or its emotions and sounds (offsets in the new text) */
export const editPartBodySchema = z
  .object({
    text: partText.optional(),
    expressions: chunkExpressionsBodySchema.optional(),
    /** This part's own voice (a character), or null to use the script's voice */
    voiceId: z.string().max(64).nullable().optional(),
    /** Silence after this part, in the MP3, subtitles and player */
    pauseAfterMs: z.number().int().min(0).max(MAX_PAUSE_MS).optional(),
    /** Keep this part's recording as it is */
    locked: z.boolean().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to change')

export const sentenceParamsSchema = partParamsSchema.extend({ sentence: z.coerce.number().int().min(0) })

/** Find and replace across a script; without `apply` it only says what would change and what it costs */
export const replaceBodySchema = z.object({
  find: z.string().min(1).max(200),
  replace: z.string().max(200),
  matchCase: z.boolean().default(false),
  wholeWord: z.boolean().default(true),
  apply: z.boolean().default(false),
})

export const insertPartBodySchema = z.object({
  /** The part it goes after; -1 for the very start */
  after: z.number().int().min(-1),
  text: partText,
})

export type DocumentParams = z.infer<typeof documentParamsSchema>
export type PartParams = z.infer<typeof partParamsSchema>
export type EditPartBody = z.infer<typeof editPartBodySchema>
export type InsertPartBody = z.infer<typeof insertPartBodySchema>
export type SentenceParams = z.infer<typeof sentenceParamsSchema>
export type ReplaceBody = z.infer<typeof replaceBodySchema>
