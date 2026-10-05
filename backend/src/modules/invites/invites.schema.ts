import { z } from 'zod'

export const redeemBodySchema = z.object({
  code: z
    .string()
    .trim()
    .min(4)
    .max(16)
    .transform((c) => c.toUpperCase().replace(/[^A-Z0-9]/g, '')),
})

export type RedeemBody = z.infer<typeof redeemBodySchema>
