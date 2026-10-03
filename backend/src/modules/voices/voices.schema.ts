import { z } from 'zod'

export const preferencesBodySchema = z
  .object({
    voiceEnId: z.string().max(64).optional(),
    voiceBnId: z.string().max(64).optional(),
    speed: z.number().min(0.5).max(3).optional(),
    dailyGoalMinutes: z.number().int().min(5).max(600).optional(),
    autoPlayNext: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

export const voiceParamsSchema = z.object({ id: z.string().max(64) })

export type PreferencesBody = z.infer<typeof preferencesBodySchema>
export type VoiceParams = z.infer<typeof voiceParamsSchema>
