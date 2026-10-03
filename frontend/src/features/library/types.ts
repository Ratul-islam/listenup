import type { ChunkExpressions } from '@/features/expression/catalog';

export type DocumentKind = 'PDF' | 'DOCX' | 'EPUB' | 'TEXT' | 'MARKDOWN' | 'WEB' | 'IMAGE';
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
export type Category = 'all' | 'books' | 'articles' | 'notes' | 'scans';
export type SortOrder = 'recent' | 'title' | 'progress';
export type Lang = 'en' | 'bn';
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
  /** "Make it expressive" (AI emotion suggestions); null until first run */
  autoExpression: AutoExpressionStatus | null;
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
  estimatedMs: number;
  /** Real length once audio exists for the active voice */
  durationMs: number | null;
}

export interface ReaderData {
  document: DocumentSummary;
  voices: Record<Lang, string>;
  /** Whether each language's voice can take emotions */
  expressive: Record<Lang, boolean>;
  speed: number;
  chunks: ReaderChunk[];
}
