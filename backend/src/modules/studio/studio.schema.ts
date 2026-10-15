import { z } from 'zod'
import { CUSTOM_TONE_MAX, NARRATION_TYPES, PITCH_RANGE, PLATFORMS, SPEED_RANGE, TONES } from './studio-catalog.js'
import { FORMATS } from './studio-formats.js'

const ids = <T extends object>(table: T) => Object.keys(table) as [Extract<keyof T, string>, ...Extract<keyof T, string>[]]

/** What a creator picks for a script; each can be left out (unchanged) or null (cleared) */
export const studioSettingsSchema = z.object({
  platform: z.enum(ids(PLATFORMS)).nullable().optional(),
  format: z.enum(ids(FORMATS)).nullable().optional(),
  type: z.enum(ids(NARRATION_TYPES)).nullable().optional(),
  tone: z.enum(ids(TONES)).nullable().optional(),
  customTone: z.string().trim().max(CUSTOM_TONE_MAX).nullable().optional(),
  speed: z.number().min(SPEED_RANGE.min).max(SPEED_RANGE.max).nullable().optional(),
  pitch: z.number().min(PITCH_RANGE.min).max(PITCH_RANGE.max).nullable().optional(),
})

export const studioParamsSchema = z.object({ documentId: z.uuid() })

/** Which platform to write the post for: the script's own when left out */
export const postBodySchema = z.object({ platform: z.enum(ids(PLATFORMS)).optional() })

export type StudioSettingsBody = z.infer<typeof studioSettingsSchema>
export type StudioParams = z.infer<typeof studioParamsSchema>
export type PostBody = z.infer<typeof postBodySchema>
