import { z } from 'zod'

// RevenueCat webhook payload; only the fields used here are checked, the rest pass through
export const webhookBodySchema = z.looseObject({
  event: z.looseObject({
    type: z.string(),
    app_user_id: z.string().nullish(),
    original_app_user_id: z.string().nullish(),
    aliases: z.array(z.string()).nullish(),
    transferred_from: z.array(z.string()).nullish(),
    transferred_to: z.array(z.string()).nullish(),
    country_code: z.string().nullish(),
  }),
})

export type WebhookBody = z.infer<typeof webhookBodySchema>
