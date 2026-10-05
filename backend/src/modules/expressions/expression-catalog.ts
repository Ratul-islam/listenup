/**
 * Emotions a listener can put on a line or a few words, and sounds they can
 * drop between words. Ids are shared with the app, which owns labels and emoji.
 *
 * Gemini TTS takes delivery as a short `style`. A chunk with one emotion
 * throughout uses `style`; otherwise each tagged span becomes a direction
 * ("…but the words "x" are said sadly") built from `phrase`. Wordings were
 * checked with an audio model as judge (Oct 2026): short, concrete directions
 * work, long prose drifts. Keep `phrase` free of commas; directions are
 * joined with ", and".
 */
export const EMOTIONS = {
  happy: { style: 'happy and warm, smiling', phrase: 'said happily with a smile', strongStyle: 'overjoyed and beaming', strongPhrase: 'said with pure joy' },
  excited: { style: 'excited and cheerful, full of energy', phrase: 'said with excitement', strongStyle: 'thrilled and bursting with energy', strongPhrase: 'said bursting with excitement' },
  calm: { style: 'calm and gentle, relaxed', phrase: 'said calmly and gently', strongStyle: 'very calm and soothing, slow and soft', strongPhrase: 'said very slowly and soothingly' },
  sad: { style: 'sad and tearful, with a heavy heart', phrase: 'said sadly', strongStyle: 'heartbroken, voice breaking with tears', strongPhrase: 'said heartbroken with a breaking voice' },
  serious: { style: 'serious and grave', phrase: 'said seriously and firmly', strongStyle: 'deadly serious and stern', strongPhrase: 'said in a stern and grave voice' },
  angry: { style: 'angry, raised voice', phrase: 'said angrily in a raised voice', strongStyle: 'furious, shouting with rage', strongPhrase: 'said furiously with rage' },
  scared: { style: 'scared, voice trembling', phrase: 'said fearfully in a trembling voice', strongStyle: 'terrified, breathless and shaking', strongPhrase: 'said in terror breathless and shaking' },
  surprised: { style: 'surprised and amazed', phrase: 'said with surprise', strongStyle: 'shocked and astonished', strongPhrase: 'said in total shock' },
  loving: { style: 'tender and loving, soft', phrase: 'said tenderly and lovingly', strongStyle: 'deeply loving and intimate, very soft', strongPhrase: 'said with deep tenderness' },
  sarcastic: { style: 'sarcastic, dry and mocking', phrase: 'said sarcastically', strongStyle: 'biting and mocking, heavy sarcasm', strongPhrase: 'said with biting sarcasm' },
  whisper: { style: 'whispering', phrase: 'whispered', strongStyle: 'barely audible whisper', strongPhrase: 'whispered so softly it is barely audible' },
  shout: { style: 'shouting loudly', phrase: 'shouted loudly', strongStyle: 'screaming at the top of the voice', strongPhrase: 'screamed at the top of the voice' },
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
}

export interface SoundMark {
  at: number
  sound: SoundId
  ai?: boolean
}

export interface ChunkExpressions {
  emotions: EmotionMark[]
  sounds: SoundMark[]
}

export const NO_EXPRESSIONS: ChunkExpressions = { emotions: [], sounds: [] }

/** Reads the JSON column defensively (older rows are null) */
export function readExpressions(value: unknown): ChunkExpressions {
  const v = value as Partial<ChunkExpressions> | null
  return {
    emotions: Array.isArray(v?.emotions) ? v.emotions.filter((m) => m.emotion in EMOTIONS) : [],
    sounds: Array.isArray(v?.sounds) ? v.sounds.filter((m) => m.sound in SOUNDS) : [],
  }
}

/**
 * Sorts marks, clamps them to the text, drops empty ones and resolves
 * overlaps (the earlier mark keeps its span). One sound per position.
 */
export function normalizeExpressions(input: ChunkExpressions, textLength: number): ChunkExpressions {
  const emotions: EmotionMark[] = []
  for (const m of [...input.emotions].sort((a, b) => a.start - b.start)) {
    const start = Math.max(m.start, emotions.at(-1)?.end ?? 0, 0)
    const end = Math.min(m.end, textLength)
    const direction = cleanDirection(m.direction)
    if (end > start) emotions.push({ start, end, emotion: m.emotion, ...(m.strong && { strong: true }), ...(direction && { direction }), ...(m.ai && { ai: true }) })
  }
  const seen = new Set<number>()
  const sounds = [...input.sounds]
    .filter((m) => m.at >= 0 && m.at <= textLength && !seen.has(m.at) && seen.add(m.at))
    .sort((a, b) => a.at - b.at)
    .map((m) => ({ at: m.at, sound: m.sound, ...(m.ai && { ai: true }) }))
  return { emotions, sounds }
}

export const hasExpressions = (e: ChunkExpressions) => e.emotions.length > 0 || e.sounds.length > 0

/** The emotions and sounds within [start, end) of a chunk, with offsets relative to `start` */
export function sliceExpressions(e: ChunkExpressions, start: number, end: number): ChunkExpressions {
  return {
    emotions: e.emotions
      .filter((m) => m.end > start && m.start < end)
      .map((m) => ({ ...m, start: Math.max(m.start, start) - start, end: Math.min(m.end, end) - start })),
    sounds: e.sounds.filter((s) => s.at >= start && s.at < end).map((s) => ({ ...s, at: s.at - start })),
  }
}
