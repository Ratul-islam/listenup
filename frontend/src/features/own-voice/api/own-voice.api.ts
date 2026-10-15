import { api } from '@/lib/api/client';
import type { Lang } from '@/lib/languages';

/** What the speaker reads to make their voice, in one language */
export interface VoiceScript {
  language: Lang;
  /** About 20 seconds read aloud: the recording the voice is made from */
  reading: string;
  /** Google's consent sentence, said word for word */
  consent: string;
}

export interface OwnVoiceState {
  /** "locked": they have a voice, but their plan doesn't include it now */
  status: 'none' | 'ready' | 'locked';
  voice: { name: string; language: Lang | null; recordedAt: string | null } | null;
  canRecord: boolean;
  /** Why a voice can't be recorded now */
  blockedBy: 'plan' | 'region' | 'setup' | 'limit' | 'full' | null;
  /** The plan that includes it ("Pro") */
  plan: string;
  /** Recordings left this month */
  attemptsLeft: number;
  /** Ask the speaker to confirm they aren't in Illinois or Texas */
  askState: boolean;
  readingSec: { min: number; max: number };
  consentSec: { min: number; max: number };
  scripts: VoiceScript[];
}

export interface RecordOwnVoice {
  language: Lang;
  /** The two recordings, base64 */
  source: string;
  consent: string;
  confirm: { ownVoice: true; adult: true; notInRestrictedState?: boolean };
}

// Converting the recordings and making the voice at Google takes a while
const RECORD_TIMEOUT_MS = 150_000;

export const ownVoiceApi = {
  get: () => api.get<OwnVoiceState>('/own-voice', { auth: true }).then((r) => r.data),
  record: (body: RecordOwnVoice) => api.post<OwnVoiceState>('/own-voice', body, { auth: true, timeoutMs: RECORD_TIMEOUT_MS }).then((r) => r.data),
  remove: () => api.delete<OwnVoiceState>('/own-voice', { auth: true, timeoutMs: 45_000 }).then((r) => r.data),
};
