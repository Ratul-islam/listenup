import { createHash } from 'node:crypto'

/**
 * Emotions a listener can put on a line or a few words, and sounds they can
 * drop between words. Ids are shared with the app, which owns labels and emoji.
 *
 * Gemini TTS takes delivery as a short `style` for everything in one request.
 * A marked line is voiced as its own request with its emotion's `style` (see
 * planRender). Wordings were checked with an audio model as judge (Oct 2026):
 * short, concrete directions work, long prose drifts.
 */
export const EMOTIONS = {
  happy: { style: 'happy and warm, smiling', strongStyle: 'overjoyed and beaming' },
  excited: { style: 'excited and cheerful, full of energy', strongStyle: 'thrilled and bursting with energy' },
  calm: { style: 'calm and gentle, relaxed', strongStyle: 'very calm and soothing, slow and soft' },
  sad: { style: 'sad and tearful, with a heavy heart', strongStyle: 'heartbroken, voice breaking with tears' },
  serious: { style: 'serious and grave', strongStyle: 'deadly serious and stern' },
  angry: { style: 'angry, raised voice', strongStyle: 'furious, shouting with rage' },
  scared: { style: 'scared, voice trembling', strongStyle: 'terrified, breathless and shaking' },
  surprised: { style: 'surprised and amazed', strongStyle: 'shocked and astonished' },
  loving: { style: 'tender and loving, soft', strongStyle: 'deeply loving and intimate, very soft' },
  sarcastic: { style: 'sarcastic, dry and mocking', strongStyle: 'biting and mocking, heavy sarcasm' },
  whisper: { style: 'whispering', strongStyle: 'barely audible whisper' },
  shout: { style: 'shouting loudly', strongStyle: 'screaming at the top of the voice' },
} as const

/** Point-in-time vocal sounds, inserted inline as Gemini audio tags */
export const SOUNDS = {
  laugh: '<laugh>',
  giggle: '<giggle>',
  sigh: '<sigh>',
  gasp: '<gasp>',
  sob: '<sob>',
  breath: '<breath>',
  pause: '<short pause>',
  'long-pause': '<long pause>',
} as const

/**
 * How a whole document is narrated on Expressive voices, as a noun phrase that
 * follows "narrated by". It colours every line, including untagged ones.
 */
export const NARRATION_STYLES = {
  suspense: 'a tense and hushed storyteller building suspense',
  horror: 'a dark and eerie storyteller, slow and ominous',
  romance: 'a warm and tender storyteller, soft and intimate',
  comedy: 'a playful and lively storyteller with comic timing',
  bedtime: 'a gentle and soothing bedtime storyteller, slow and warm',
  drama: 'an expressive and heartfelt storyteller',
  adventure: 'an energetic and vivid adventure storyteller',
  documentary: 'a clear and engaging documentary narrator',
  lecture: 'a clear and friendly teacher explaining',
  calm: 'a calm and unhurried narrator',
} as const

export const NARRATION_STRENGTHS = {
  subtle: 'with understated emotion',
  balanced: '',
  dramatic: 'with vivid and theatrical emotion',
} as const

export type NarrationStyleId = keyof typeof NARRATION_STYLES
export type NarrationStrength = keyof typeof NARRATION_STRENGTHS
export const NARRATION_STYLE_IDS = Object.keys(NARRATION_STYLES) as [NarrationStyleId, ...NarrationStyleId[]]
export const NARRATION_STRENGTH_IDS = Object.keys(NARRATION_STRENGTHS) as [NarrationStrength, ...NarrationStrength[]]

// Free-text directions ("like a scared little child") stay short: long prose drifts
export const MAX_DIRECTION_CHARS = 80

/** Makes a free-text direction safe to embed: one line, no quotes or commas, short */
export const cleanDirection = (text: string | undefined | null) => {
  const clean = (text ?? '').replace(/["“”]/g, "'").replace(/[,;\n\r]+/g, ' ').replace(/\s+/g, ' ').trim()
  return clean ? clean.slice(0, MAX_DIRECTION_CHARS) : undefined
}

/** The narration direction stamped on a document's chunks */
export function narrationText(narrator: string | undefined, strength: NarrationStrength | null | undefined) {
  if (!narrator) return null
  return [narrator, NARRATION_STRENGTHS[strength ?? 'balanced']].filter(Boolean).join(' ')
}

export type EmotionId = keyof typeof EMOTIONS
export type SoundId = keyof typeof SOUNDS

export const EMOTION_IDS = Object.keys(EMOTIONS) as [EmotionId, ...EmotionId[]]
export const SOUND_IDS = Object.keys(SOUNDS) as [SoundId, ...SoundId[]]

/** Character offsets within a chunk's text */
export interface EmotionMark {
  start: number
  end: number
  emotion: EmotionId
  /** A stronger version of the emotion ("heartbroken" rather than "sad") */
  strong?: boolean
  /** How exactly to say it, in words ("like a scared little child"); used instead of the emotion's own wording */
  direction?: string
  /** Suggested by "Make it expressive" rather than set by the listener */
  ai?: boolean
  /** "Say it yourself": the listener's own performance of exactly these words, which the voice is shaped to */
  shape?: PerformanceRef
}

/** A kept performance (its measurements are a file in storage) and the words it was said for */
export interface PerformanceRef {
  id: string
  /** wordsKey() of the words: a performance of other words is no use */
  of: string
  /** Whose document it was recorded in, as "<user id>/<document id>": it's kept with that document's files */
  in: string
}

const PERFORMANCE_ID = /^[a-f0-9]{24}$/
const PERFORMANCE_HOME = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/

/**
 * Where a performance's measurements are kept: with the files of the document
 * it was recorded in, so they go when that document or its owner's account
 * does. A copy of the document (a writing added from Explore) reads them from
 * there, and is voiced unshaped once they're gone.
 */
export const performanceKey = (ref: Pick<PerformanceRef, 'id' | 'in'>) => `documents/${ref.in}/performances/${ref.id}.json`

/** What identifies the words a performance belongs to: their letters and digits, however they're spaced or punctuated */
export const wordsKey = (words: string) =>
  createHash('sha256')
    .update((words.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).join(' '))
    .digest('hex')
    .slice(0, 12)

const readShape = (shape: unknown): PerformanceRef | undefined => {
  const s = shape as Partial<PerformanceRef> | null | undefined
  const valid = s && typeof s.id === 'string' && PERFORMANCE_ID.test(s.id) && typeof s.of === 'string' && s.of.length <= 16 && typeof s.in === 'string' && PERFORMANCE_HOME.test(s.in)
  return valid ? { id: s.id!, of: s.of!, in: s.in! } : undefined
}

export interface SoundMark {
  at: number
  sound: SoundId
  ai?: boolean
}

export type Gender = 'female' | 'male'

/** Words a character says aloud. Their voice reads them instead of the narrator's (see castVoice). */
export interface SpeakerMark {
  start: number
  end: number
  /** The character, as the story names them */
  name: string
  gender?: Gender
  /** Their place among the story's characters of the same gender, which decides the voice they get */
  rank: number
  /** The voice the listener chose for them, in place of the automatic one */
  voiceId?: string
  /**
   * How they sound, in a few words ("young and anxious with a trembling tone"): the one direction
   * every line of theirs is voiced with, so they stay one person from line to line
   */
  manner?: string
  /** Found by "Make it expressive" */
  ai?: boolean
}

export interface ChunkExpressions {
  emotions: EmotionMark[]
  sounds: SoundMark[]
  /** Who says which words; empty when everything is the narrator's */
  speakers: SpeakerMark[]
}

export const NO_EXPRESSIONS: ChunkExpressions = { emotions: [], sounds: [], speakers: [] }

/** Reads the JSON column defensively (older rows are null) */
export function readExpressions(value: unknown): ChunkExpressions {
  const v = value as Partial<ChunkExpressions> | null
  return {
    emotions: Array.isArray(v?.emotions) ? v.emotions.filter((m) => m.emotion in EMOTIONS) : [],
    sounds: Array.isArray(v?.sounds) ? v.sounds.filter((m) => m.sound in SOUNDS) : [],
    speakers: Array.isArray(v?.speakers) ? v.speakers.filter((m) => typeof m?.name === 'string' && Number.isInteger(m.start) && Number.isInteger(m.end)) : [],
  }
}

/**
 * Sorts marks, clamps them to the text, drops empty ones and resolves
 * overlaps (the earlier mark keeps its span). One sound per position.
 */
export function normalizeExpressions(input: Omit<ChunkExpressions, 'speakers'> & { speakers?: SpeakerMark[] }, textLength: number): ChunkExpressions {
  const emotions: EmotionMark[] = []
  for (const m of [...input.emotions].sort((a, b) => a.start - b.start)) {
    const start = Math.max(m.start, emotions.at(-1)?.end ?? 0, 0)
    const end = Math.min(m.end, textLength)
    const direction = cleanDirection(m.direction)
    const shape = readShape(m.shape)
    if (end > start) emotions.push({ start, end, emotion: m.emotion, ...(m.strong && { strong: true }), ...(direction && { direction }), ...(m.ai && { ai: true }), ...(shape && { shape }) })
  }
  const seen = new Set<number>()
  const sounds = [...input.sounds]
    .filter((m) => m.at >= 0 && m.at <= textLength && !seen.has(m.at) && seen.add(m.at))
    .sort((a, b) => a.at - b.at)
    .map((m) => ({ at: m.at, sound: m.sound, ...(m.ai && { ai: true }) }))
  const speakers: SpeakerMark[] = []
  for (const m of [...(input.speakers ?? [])].sort((a, b) => a.start - b.start)) {
    const start = Math.max(m.start, speakers.at(-1)?.end ?? 0, 0)
    const end = Math.min(m.end, textLength)
    const name = m.name.trim().slice(0, 60)
    const manner = cleanDirection(m.manner)
    if (end > start && name) {
      speakers.push({
        start,
        end,
        name,
        ...(m.gender && { gender: m.gender }),
        rank: Math.max(0, Math.round(m.rank) || 0),
        ...(m.voiceId && { voiceId: m.voiceId }),
        ...(manner && { manner }),
        ...(m.ai && { ai: true }),
      })
    }
  }
  return { emotions, sounds, speakers }
}

export const hasExpressions = (e: ChunkExpressions) => e.emotions.length > 0 || e.sounds.length > 0 || e.speakers.length > 0

/** The emotions and sounds within [start, end) of a chunk, with offsets relative to `start` */
export function sliceExpressions(e: ChunkExpressions, start: number, end: number): ChunkExpressions {
  return {
    emotions: e.emotions
      .filter((m) => m.end > start && m.start < end)
      .map((m) => ({ ...m, start: Math.max(m.start, start) - start, end: Math.min(m.end, end) - start })),
    sounds: e.sounds.filter((s) => s.at >= start && s.at < end).map((s) => ({ ...s, at: s.at - start })),
    speakers: e.speakers
      .filter((m) => m.end > start && m.start < end)
      .map((m) => ({ ...m, start: Math.max(m.start, start) - start, end: Math.min(m.end, end) - start })),
  }
}
