/**
 * What a creator picks for a script in Studio: the platform it's for, the kind of narration,
 * and the voice's tone, speed and pitch. The platform suggests a narration type, a length
 * to aim for and how the MP3 is finished; the narration type sets the tone and pace unless
 * the creator sets their own. The app reads all of it from GET /studio/catalog.
 */

import { FORMATS, type FormatId } from './studio-formats.js'

/** How a voice sounds: the direction an Expressive voice is given for the whole script */
export const TONES = {
  warm: { label: 'Warm', style: 'in a warm, friendly tone' },
  energetic: { label: 'Energetic', style: 'in an upbeat, energetic tone' },
  calm: { label: 'Calm', style: 'in a calm, soothing tone' },
  serious: { label: 'Serious', style: 'in a serious, authoritative tone' },
  conversational: { label: 'Conversational', style: 'in a relaxed, conversational tone, like talking to a friend' },
  dramatic: { label: 'Dramatic', style: 'in a dramatic, gripping tone' },
  inspiring: { label: 'Inspiring', style: 'in an inspiring, uplifting tone' },
  playful: { label: 'Playful', style: 'in a playful, light-hearted tone' },
} as const
export type ToneId = keyof typeof TONES

/** The kinds of narration a creator makes, each with the tone and pace it's read at */
export const NARRATION_TYPES = {
  explainer: { label: 'Explainer', style: 'like a clear, friendly teacher explaining step by step', speed: 1 },
  storytelling: { label: 'Storytelling', style: 'like a warm, captivating storyteller', speed: 0.95 },
  documentary: { label: 'Documentary', style: 'like a calm, authoritative documentary narrator', speed: 0.95 },
  news: { label: 'News', style: 'like a crisp, neutral news presenter', speed: 1.05 },
  promo: { label: 'Ad or promo', style: 'upbeat, persuasive and confident, like a radio ad', speed: 1.05 },
  motivational: { label: 'Motivational', style: 'inspiring and uplifting, with conviction', speed: 1 },
  review: { label: 'Review or top list', style: 'energetic and punchy, keeping the pace up', speed: 1.1 },
  conversational: { label: 'Conversational', style: 'relaxed and conversational, like a podcast host talking to a friend', speed: 1 },
  calm: { label: 'Calm or sleep', style: 'calm, soft and soothing', speed: 0.85 },
} as const
export type NarrationTypeId = keyof typeof NARRATION_TYPES

/**
 * How loud the finished MP3 is. Video: YouTube turns louder videos down to about −14 LUFS and
 * never turns quieter ones up; TikTok, Instagram and Facebook publish no target and guides say
 * −14. Podcast: Apple asks for −16 LUFS (±1). Audiobook: ACX (Audible) asks for −23 to −18 dB
 * RMS with peaks no higher than −3 dB; −20 LUFS sits in the middle. True peak −1 dB otherwise.
 */
export const LOUDNESS = {
  video: { label: 'Video', lufs: -14, peakDb: -1 },
  podcast: { label: 'Podcast', lufs: -16, peakDb: -1 },
  audiobook: { label: 'Audiobook', lufs: -20, peakDb: -3 },
} as const
export type LoudnessId = keyof typeof LOUDNESS

/**
 * Where a script will be published. Lengths are the longest each platform takes (Oct 2026:
 * Shorts 3 min; TikTok 10 min for most accounts, varying by account and region; Reels are
 * recommended to non-followers up to 3 min). None for platforms without one worth showing.
 */
export const PLATFORMS = {
  youtube: { label: 'YouTube', types: ['explainer', 'documentary', 'storytelling', 'review', 'news'], loudness: 'video', subtitles: 'srt', maxSec: null, disclosure: 'youtube' },
  shorts: { label: 'YouTube Shorts', types: ['explainer', 'storytelling', 'review', 'motivational'], loudness: 'video', subtitles: 'shortSrt', maxSec: 180, disclosure: 'youtube' },
  tiktok: { label: 'TikTok', types: ['storytelling', 'explainer', 'review', 'motivational'], loudness: 'video', subtitles: 'wordsSrt', maxSec: 600, disclosure: 'tiktok' },
  reels: { label: 'Instagram Reels', types: ['storytelling', 'motivational', 'promo', 'explainer'], loudness: 'video', subtitles: 'wordsSrt', maxSec: 180, disclosure: 'meta' },
  facebook: { label: 'Facebook', types: ['storytelling', 'news', 'explainer', 'promo'], loudness: 'video', subtitles: 'srt', maxSec: null, disclosure: 'meta' },
  podcast: { label: 'Podcast', types: ['conversational', 'storytelling', 'news', 'documentary'], loudness: 'podcast', subtitles: 'none', maxSec: null, disclosure: null },
  audiobook: { label: 'Audiobook', types: ['storytelling', 'documentary', 'calm'], loudness: 'audiobook', subtitles: 'none', maxSec: null, disclosure: null },
} as const satisfies Record<string, { label: string; types: NarrationTypeId[]; loudness: LoudnessId; subtitles: 'srt' | 'shortSrt' | 'wordsSrt' | 'none'; maxSec: number | null; disclosure: string | null }>
export type PlatformId = keyof typeof PLATFORMS

// Further than this and a voice stops sounding like itself: past about 1.25× or 0.75× words run
// together or drag, and past 4 semitones the voice sounds processed
export const SPEED_RANGE = { min: 0.75, max: 1.25 } as const
export const PITCH_RANGE = { min: -4, max: 4 } as const
export const CUSTOM_TONE_MAX = 100

/** What a creator chose for a script (all optional; null clears a choice) */
export interface StudioSettings {
  platform?: PlatformId | null
  /** A narration style made for a platform (from its page in Studio); it takes the place of `type` */
  format?: FormatId | null
  type?: NarrationTypeId | null
  tone?: ToneId | null
  /** Their own words for the tone, in place of a preset */
  customTone?: string | null
  /** 1 is the voice's own pace */
  speed?: number | null
  /** Semitones up or down; 0 is the voice's own */
  pitch?: number | null
}

/** What each part of a script is voiced with: its direction, pace and pitch */
export interface PartDelivery {
  style?: string
  speed?: number
  pitch?: number
}

const isIn = <T extends object>(table: T, id: unknown): id is keyof T => typeof id === 'string' && Object.prototype.hasOwnProperty.call(table, id)
const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value))

/** A script's stored settings, whatever shape they were saved in */
export function readStudio(value: unknown): StudioSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    // A platform's style always comes with its platform
    platform: isIn(PLATFORMS, v.platform) ? v.platform : isIn(FORMATS, v.format) ? FORMATS[v.format].platform : null,
    format: isIn(FORMATS, v.format) ? v.format : null,
    type: isIn(NARRATION_TYPES, v.type) ? v.type : null,
    tone: isIn(TONES, v.tone) ? v.tone : null,
    customTone: typeof v.customTone === 'string' && v.customTone.trim() ? v.customTone.trim().slice(0, CUSTOM_TONE_MAX) : null,
    speed: typeof v.speed === 'number' && Number.isFinite(v.speed) ? clamp(v.speed, SPEED_RANGE) : null,
    pitch: typeof v.pitch === 'number' && Number.isFinite(v.pitch) ? clamp(Math.round(v.pitch * 2) / 2, PITCH_RANGE) : null,
  }
}

/**
 * The settings as each part is voiced: the creator's own tone first, then the preset, then the
 * platform style's or the narration type's; their speed, or the style's or type's. Null when
 * nothing differs from the voice's own.
 */
export function partDelivery(settings: StudioSettings): PartDelivery | null {
  const type = settings.format ? FORMATS[settings.format] : settings.type ? NARRATION_TYPES[settings.type] : null
  const style = settings.customTone ? `in this tone: ${settings.customTone}` : settings.tone ? TONES[settings.tone].style : (type?.style ?? undefined)
  const speed = settings.speed ?? type?.speed ?? 1
  const pitch = settings.pitch ?? 0
  const delivery: PartDelivery = { ...(style && { style }), ...(speed !== 1 && { speed }), ...(pitch !== 0 && { pitch }) }
  return Object.keys(delivery).length ? delivery : null
}

/** A part's stored delivery, whatever shape it was saved in */
export function readDelivery(value: unknown): PartDelivery {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    ...(typeof v.style === 'string' && v.style && { style: v.style }),
    ...(typeof v.speed === 'number' && v.speed !== 1 && { speed: clamp(v.speed, SPEED_RANGE) }),
    ...(typeof v.pitch === 'number' && v.pitch !== 0 && { pitch: clamp(v.pitch, PITCH_RANGE) }),
  }
}

/** How a script's MP3 is finished for its platform (null: as it comes, for scripts without one) */
export function exportLoudness(studio: unknown): LoudnessId | null {
  const settings = readStudio(studio)
  const platform = settings.platform ?? (settings.format ? FORMATS[settings.format].platform : null)
  return platform ? PLATFORMS[platform].loudness : null
}
