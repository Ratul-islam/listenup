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
  happy: { style: 'happy and warm, smiling', phrase: 'said happily with a smile' },
  excited: { style: 'excited and cheerful, full of energy', phrase: 'said with excitement' },
  calm: { style: 'calm and gentle, relaxed', phrase: 'said calmly and gently' },
  sad: { style: 'sad and tearful, with a heavy heart', phrase: 'said sadly' },
  serious: { style: 'serious and grave', phrase: 'said seriously and firmly' },
  angry: { style: 'angry, raised voice', phrase: 'said angrily in a raised voice' },
  scared: { style: 'scared, voice trembling', phrase: 'said fearfully in a trembling voice' },
  surprised: { style: 'surprised and amazed', phrase: 'said with surprise' },
  loving: { style: 'tender and loving, soft', phrase: 'said tenderly and lovingly' },
  sarcastic: { style: 'sarcastic, dry and mocking', phrase: 'said sarcastically' },
  whisper: { style: 'whispering', phrase: 'whispered' },
  shout: { style: 'shouting loudly', phrase: 'shouted loudly' },
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

export type EmotionId = keyof typeof EMOTIONS
export type SoundId = keyof typeof SOUNDS

export const EMOTION_IDS = Object.keys(EMOTIONS) as [EmotionId, ...EmotionId[]]
export const SOUND_IDS = Object.keys(SOUNDS) as [SoundId, ...SoundId[]]

/** Character offsets within a chunk's text */
export interface EmotionMark {
  start: number
  end: number
  emotion: EmotionId
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
    if (end > start) emotions.push({ start, end, emotion: m.emotion, ...(m.ai && { ai: true }) })
  }
  const seen = new Set<number>()
  const sounds = [...input.sounds]
    .filter((m) => m.at >= 0 && m.at <= textLength && !seen.has(m.at) && seen.add(m.at))
    .sort((a, b) => a.at - b.at)
    .map((m) => ({ at: m.at, sound: m.sound, ...(m.ai && { ai: true }) }))
  return { emotions, sounds }
}

export const hasExpressions = (e: ChunkExpressions) => e.emotions.length > 0 || e.sounds.length > 0
