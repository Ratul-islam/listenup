import { z } from 'zod'

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>
