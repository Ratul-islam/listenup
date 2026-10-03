import { z } from 'zod'

export const folderParamsSchema = z.object({ id: z.uuid() })

export const folderBodySchema = z.object({
  name: z.string().trim().min(1, 'Give the folder a name').max(60),
})

export type FolderParams = z.infer<typeof folderParamsSchema>
export type FolderBody = z.infer<typeof folderBodySchema>
