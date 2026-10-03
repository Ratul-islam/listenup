/**
 * Emotions and sounds a listener can add to their text. Ids match the
 * server's catalog, which turns them into speech directions.
 */
export type EmotionId =
  | 'happy'
  | 'excited'
  | 'calm'
  | 'sad'
  | 'serious'
  | 'angry'
  | 'scared'
  | 'surprised'
  | 'loving'
  | 'sarcastic'
  | 'whisper'
  | 'shout';

export type SoundId = 'laugh' | 'giggle' | 'sigh' | 'gasp' | 'sob' | 'breath' | 'pause' | 'long-pause';

export interface EmotionMeta {
  id: EmotionId;
  label: string;
  emoji: string;
  /** Tints tagged text; used with alpha so it reads in light and dark */
  color: string;
}

export const EMOTIONS: EmotionMeta[] = [
  { id: 'happy', label: 'Happy', emoji: '😊', color: '#f59e0b' },
  { id: 'excited', label: 'Excited', emoji: '🤩', color: '#f97316' },
  { id: 'calm', label: 'Calm', emoji: '😌', color: '#14b8a6' },
  { id: 'loving', label: 'Loving', emoji: '🥰', color: '#ec4899' },
  { id: 'sad', label: 'Sad', emoji: '😢', color: '#3b82f6' },
  { id: 'scared', label: 'Scared', emoji: '😨', color: '#8b5cf6' },
  { id: 'angry', label: 'Angry', emoji: '😠', color: '#ef4444' },
  { id: 'surprised', label: 'Surprised', emoji: '😲', color: '#eab308' },
  { id: 'serious', label: 'Serious', emoji: '🧐', color: '#64748b' },
  { id: 'sarcastic', label: 'Sarcastic', emoji: '😏', color: '#a16207' },
  { id: 'whisper', label: 'Whisper', emoji: '🤫', color: '#6366f1' },
  { id: 'shout', label: 'Shout', emoji: '📢', color: '#dc2626' },
];

export interface SoundMeta {
  id: SoundId;
  label: string;
  emoji: string;
}

export const SOUNDS: SoundMeta[] = [
  { id: 'laugh', label: 'Laugh', emoji: '😂' },
  { id: 'giggle', label: 'Giggle', emoji: '🤭' },
  { id: 'sigh', label: 'Sigh', emoji: '😮‍💨' },
  { id: 'gasp', label: 'Gasp', emoji: '😮' },
  { id: 'sob', label: 'Sob', emoji: '😭' },
  { id: 'breath', label: 'Breath', emoji: '🌬️' },
  { id: 'pause', label: 'Pause', emoji: '⏸️' },
  { id: 'long-pause', label: 'Long pause', emoji: '⏳' },
];

export const emotionMeta = Object.fromEntries(EMOTIONS.map((e) => [e.id, e])) as Record<EmotionId, EmotionMeta>;
export const soundMeta = Object.fromEntries(SOUNDS.map((s) => [s.id, s])) as Record<SoundId, SoundMeta>;

/** Character offsets within a chunk's text */
export interface EmotionMark {
  start: number;
  end: number;
  emotion: EmotionId;
  /** Suggested by "Make it expressive" */
  ai?: boolean;
}

export interface SoundMark {
  at: number;
  sound: SoundId;
  ai?: boolean;
}

export interface ChunkExpressions {
  emotions: EmotionMark[];
  sounds: SoundMark[];
}

/** Background tint for text with an emotion (~18% opacity) */
export const tint = (emotion: EmotionId) => `${emotionMeta[emotion].color}2e`;
