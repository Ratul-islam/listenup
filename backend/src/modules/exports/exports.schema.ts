import { z } from 'zod'

export const exportParamsSchema = z.object({ documentId: z.uuid() })

export const exportBodySchema = z.object({
  /** The voice the listener has picked in the player, so the MP3 sounds the same */
  voiceId: z.string().max(64).optional(),
})

export type ExportParams = z.infer<typeof exportParamsSchema>
export type ExportBody = z.infer<typeof exportBodySchema>
