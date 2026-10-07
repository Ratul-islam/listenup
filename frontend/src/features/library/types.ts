import type { ChunkExpressions, NarrationStrength, NarrationStyleId } from '@/features/expression/catalog';
import type { PronunciationRule } from '@/features/pronunciations/lib/pronounce';
import type { VoiceTier } from '@/features/voices/api/voices.api';
import type { Lang } from '@/lib/languages';

export type { Lang };

export type DocumentKind = 'PDF' | 'DOCX' | 'EPUB' | 'TEXT' | 'MARKDOWN' | 'WEB' | 'IMAGE';
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
export type Category = 'all' | 'books' | 'articles' | 'notes' | 'scans';
export type SortOrder = 'recent' | 'title' | 'progress';
export type AutoExpressionStatus = 'RUNNING' | 'DONE' | 'FAILED';

export interface DocumentProgress {
  chunkIndex: number;
  offsetMs: number;
  voiceId: string | null;
  speed: number;
  /** 0..1 */
  fraction: number;
  completedAt: string | null;
  updatedAt: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  author: string | null;
  kind: DocumentKind;
  status: DocumentStatus;
  error: string | null;
  /** Null when loose on the shelf */
  folderId: string | null;
  sourceUrl: string | null;
  fileName: string | null;
  language: Lang | 'mixed' | null;
  excerpt: string | null;
  charCount: number;
  chunkCount: number;
  estimatedDurationSec: number;
  usedOcr: boolean;
  /** Citations, links and reference lists are read aloud instead of skipped */
  keepClutter: boolean;
  /** Set on a translation: the document it came from */
  translatedFromId: string | null;
  /** A creator's script, kept in Studio rather than on the Soundshelf */
  isScript?: boolean;
  /** When a part was last edited in the app; reading the source again would undo edits */
  editedAt?: string | null;
  /** Seconds of new audio it has used from the owner's minutes */
  voicedSec?: number;
  /** In the owner's private podcast feed (Plus and Pro) */
  inPodcast?: boolean;
  /** "Make it expressive" (AI emotion suggestions); null until first run */
  autoExpression: AutoExpressionStatus | null;
  /** How the whole document is narrated on HD voices (older servers leave it out) */
  narration?: {
    /** "auto", a style, or null for plain narration */
    style: NarrationStyleId | 'auto' | null;
    strength: NarrationStrength | null;
    /** What "Make it expressive" detected, when the style is "auto" */
    detected: NarrationStyleId | null;
  };
  createdAt: string;
  updatedAt: string;
  progress: DocumentProgress | null;
}

export interface DocumentList {
  items: DocumentSummary[];
  counts: Record<Category, number>;
}

export interface SentenceSpan {
  start: number;
  end: number;
  paragraphStart: boolean;
}

export interface ReaderChunk {
  index: number;
  text: string;
  language: Lang;
  sentences: SentenceSpan[];
  /** Emotions and sounds added by the listener or AI */
  expressions: ChunkExpressions;
  /** "New take" count: the same words recorded again */
  take?: number;
  /** Sentences redone on their own and spliced in: sentence index → take */
  sentenceTakes?: Record<string, number>;
  /** The voice reading this part, its level and whether it takes emotions (older servers leave these out) */
  voiceId?: string;
  tier?: VoiceTier;
  expressive?: boolean;
  /** The part's own voice (a character), or null when it uses the script's voice */
  ownVoiceId?: string | null;
  /** Silence after this part, in the player, MP3 and subtitles */
  pauseAfterMs?: number;
  /** A locked part keeps its recording */
  locked?: boolean;
  /** The voiced audio's loudness in 48 slices (0–100), drawn as its waveform; null until measured */
  peaks?: number[] | null;
  estimatedMs: number;
  /** Real length once audio exists for the active voice */
  durationMs: number | null;
}

export interface ReaderData {
  document: DocumentSummary;
  voices: Record<Lang, string>;
  /** Whether each language's voice can take emotions */
  expressive: Record<Lang, boolean>;
  /** Each language's voice level; "phone" voices are voiced on this device */
  tiers: Record<Lang, VoiceTier>;
  speed: number;
  /** The listener's pronunciations, applied to voices made on this phone too */
  pronunciations?: PronunciationRule[];
  chunks: ReaderChunk[];
}
