import { z } from 'zod'

export const episodeParamsSchema = z.object({ documentId: z.uuid() })
export const feedParamsSchema = z.object({ token: z.string().min(16).max(64) })
// "<documentId>.mp3"; podcast apps want a file-like address
export const episodeFileParamsSchema = z.object({
  token: z.string().min(16).max(64),
  file: z.string().regex(/^[0-9a-f-]{36}\.mp3$/i),
})

export type EpisodeParams = z.infer<typeof episodeParamsSchema>
export type FeedParams = z.infer<typeof feedParamsSchema>
export type EpisodeFileParams = z.infer<typeof episodeFileParamsSchema>
