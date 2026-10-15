import { api } from '@/lib/api/client';

export interface AudioExport {
  status: 'NONE' | 'RUNNING' | 'READY' | 'FAILED';
  /** False when the document's audio changed since (voice, emotions); a fresh export is needed */
  upToDate?: boolean;
  chunksDone?: number;
  chunkCount?: number;
  sizeBytes?: number | null;
  durationMs?: number | null;
  error?: string | null;
  /** Short-lived download link when ready */
  url?: string | null;
  /** Captions timed to the MP3, for video editors; "short" ones are one line each, "words" two or three words at a time */
  subtitles?: { srt: string; vtt: string; shortSrt?: string; shortVtt?: string; wordsSrt?: string } | null;
  /** The script as plain text, for a video description */
  transcript?: string | null;
  /** What making it now would cost: only parts without current audio are voiced */
  voicing?: ExportVoicing;
}

export interface ExportVoicing {
  partsToVoice: number;
  secondsToVoice: number;
  partCount: number;
  totalSeconds: number;
}

/** One MP3 the listener has made, as "Your exports" lists it */
export interface ExportItem {
  documentId: string;
  title: string;
  isScript: boolean;
  status: 'RUNNING' | 'READY' | 'FAILED';
  chunksDone: number;
  chunkCount: number;
  durationMs: number | null;
  sizeBytes: number | null;
  error: string | null;
  voiceName: string | null;
  madeAt: string;
  /** Short-lived link to play or save it (Plus and Pro, when it's ready) */
  url: string | null;
}

const query = (voiceId?: string) => (voiceId ? `?voiceId=${encodeURIComponent(voiceId)}` : '');

export const exportsApi = {
  /** Every MP3 the listener has made, newest first */
  list: () => api.get<{ items: ExportItem[] }>('/exports', { auth: true }).then((r) => r.data.items),
  status: (documentId: string, voiceId?: string) =>
    api.get<{ export: AudioExport }>(`/documents/${documentId}/export${query(voiceId)}`, { auth: true }).then((r) => r.data.export),
  /** Voices whatever is missing and builds the MP3 and subtitles (Plus and Pro) */
  start: (documentId: string, voiceId?: string) =>
    api.post<{ export: AudioExport }>(`/documents/${documentId}/export`, { voiceId }, { auth: true }).then((r) => r.data.export),
};
