import { File, UploadType } from 'expo-file-system';

import { ApiError } from '@/lib/api/api-error';
import { api } from '@/lib/api/client';
import type { Lang } from '@/lib/languages';

/** A voice translation as the server reports it */
export interface VoiceTranslation {
  documentId: string;
  /** "listening": being written down and translated */
  status: 'listening' | 'ready' | 'failed';
  from: Lang | null;
  to: Lang;
  /** What was said, in its own language */
  transcript: string | null;
  durationSec: number | null;
  error: string | null;
  speaker: {
    /** "unavailable": too little clear speech in the recording to make a voice from */
    status: 'none' | 'ready' | 'unavailable';
    voiceId: string | null;
    consentedAt: string | null;
  };
  /** Google's sentence the speaker reads aloud to agree to their voice being made */
  consent: { language: Lang; sentence: string; sec: { min: number; max: number } };
  canClone: boolean;
  blockedBy: 'plan' | 'region' | 'setup' | 'limit' | null;
  /** Ask the listener to confirm the speaker isn't in Illinois or Texas */
  askState: boolean;
}

interface UploadTicket {
  uploadId: string;
  url: string;
  headers: Record<string, string>;
}

// Making a voice at Google takes a while
const CONSENT_TIMEOUT_MS = 120_000;

export const voiceTranslationApi = {
  /**
   * Sends a recording straight to storage, then starts it being written down and translated
   * into `to`. It becomes a script, filled in when it's been heard.
   */
  start: async (file: { uri: string; name: string }, to: Lang) => {
    const source = new File(file.uri);
    const { data: ticket } = await api.post<UploadTicket>('/voice-translations/uploads', { fileName: file.name, size: source.size }, { auth: true });
    const sent = await source.upload(ticket.url, { httpMethod: 'PUT', uploadType: UploadType.BINARY_CONTENT, headers: ticket.headers });
    if (sent.status < 200 || sent.status >= 300) {
      throw new ApiError("The upload didn't go through. Check your connection and try again.", sent.status, 'UPLOAD_FAILED');
    }
    const { data } = await api.post<{ translation: VoiceTranslation }>('/voice-translations', { uploadId: ticket.uploadId, fileName: file.name, to }, { auth: true });
    return data.translation;
  },

  get: (documentId: string) => api.get<{ translation: VoiceTranslation }>(`/voice-translations/${documentId}`, { auth: true }).then((r) => r.data.translation),

  /** The speaker's consent recording: their voice is made from it, and reads the translation */
  consent: (documentId: string, body: { consent: string; language: Lang; confirm: { speakerAgreed: true; notInRestrictedState: boolean } }) =>
    api
      .post<{ translation: VoiceTranslation }>(`/voice-translations/${documentId}/consent`, body, { auth: true, timeoutMs: CONSENT_TIMEOUT_MS })
      .then((r) => r.data.translation),
};
