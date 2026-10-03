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
}

const query = (voiceId?: string) => (voiceId ? `?voiceId=${encodeURIComponent(voiceId)}` : '');

export const exportsApi = {
  status: (documentId: string, voiceId?: string) =>
    api.get<{ export: AudioExport }>(`/exports/${documentId}${query(voiceId)}`, { auth: true }).then((r) => r.data.export),
  /** Voices whatever is missing and builds the MP3 (Plus and Pro) */
  start: (documentId: string, voiceId?: string) =>
    api.post<{ export: AudioExport }>(`/exports/${documentId}`, { voiceId }, { auth: true }).then((r) => r.data.export),
};
