import { z } from 'zod'
import { COVER_MAX_BYTES } from '../../lib/image/cover.js'

export const idParamsSchema = z.object({ id: z.uuid() })

const penNameField = z.string().trim().min(2, 'Pen names need at least 2 characters').max(40, 'Pen names can be up to 40 characters')

export const feedQuerySchema = z.object({
  kind: z.enum(['writing', 'clip']).default('writing'),
  /** `next` from the previous page */
  cursor: z.string().max(100).optional(),
})

/** Before publishing a writing: what it would cost and whether it can enter the contest */
export const previewQuerySchema = z.object({
  documentId: z.uuid(),
  voiceId: z.string().max(64).optional(),
})

/**
 * A writing (a whole document, voiced as the writer set it up), or a clip (a
 * line or paragraph of one part, voiced like a voice note).
 */
export const publishBodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('writing'),
    documentId: z.uuid(),
    title: z.string().trim().min(1).max(120),
    voiceId: z.string().max(64),
    /** Enter this month's contest (one entry a month) */
    contest: z.boolean().default(false),
    /** Needed the first time; changes it otherwise */
    penName: penNameField.optional(),
    /** "I wrote this myself" */
    ownWork: z.literal(true, 'Only your own writing can be published'),
    /** A cover picture (JPEG, PNG or WebP) as base64; the drawn cover is used without one */
    cover: z
      .string()
      .max(Math.ceil((COVER_MAX_BYTES * 4) / 3) + 4, 'That picture is too large. Choose one under 6 MB.')
      .optional(),
  }),
  z.object({
    kind: z.literal('clip'),
    documentId: z.uuid(),
    chunkIndex: z.number().int().min(0),
    start: z.number().int().min(0),
    end: z.number().int().min(1),
    voiceId: z.string().max(64).optional(),
    penName: penNameField.optional(),
  }),
])

export const profileBodySchema = z.object({ penName: penNameField })

export const REPORT_REASONS = ['spam', 'hate', 'sexual', 'violence', 'copied', 'private', 'other'] as const
export const reportBodySchema = z.object({
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(500).optional(),
})

export const unblockParamsSchema = z.object({ userId: z.uuid() })

export const reviewBodySchema = z.object({
  action: z.enum(['restore', 'remove']),
  /** Shown to the writer when it's removed */
  note: z.string().trim().max(300).optional(),
})

export const contestParamsSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM') })
export const themeBodySchema = z.object({ theme: z.string().trim().max(80).nullable() })

export type FeedQuery = z.infer<typeof feedQuerySchema>
export type PreviewQuery = z.infer<typeof previewQuerySchema>
export type PublishBody = z.infer<typeof publishBodySchema>
export type WritingBody = Extract<PublishBody, { kind: 'writing' }>
export type ClipBody = Extract<PublishBody, { kind: 'clip' }>
export type ProfileBody = z.infer<typeof profileBodySchema>
export type ReportBody = z.infer<typeof reportBodySchema>
export type ReviewBody = z.infer<typeof reviewBodySchema>
export type ThemeBody = z.infer<typeof themeBodySchema>
export type IdParams = z.infer<typeof idParamsSchema>
export type UnblockParams = z.infer<typeof unblockParamsSchema>
export type ContestParams = z.infer<typeof contestParamsSchema>
