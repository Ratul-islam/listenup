import { api } from '@/lib/api/client';

export interface Voice {
  id: string;
  name: string;
  language: 'en' | 'bn';
  accent: string;
  style: string;
  gender: 'female' | 'male';
  quality: 'standard' | 'hd';
  /** Can speak with emotions */
  expressive: boolean;
}

export interface VoicePreferences {
  voiceEnId: string;
  voiceBnId: string;
  speed: number;
  dailyGoalMinutes: number;
  /** Start the next unfinished shelf item when one finishes */
  autoPlayNext: boolean;
}

export interface Usage {
  period: string;
  plan: { id: string; name: string };
  usedCharacters: number;
  limitCharacters: number;
  remainingCharacters: number;
}

export const voicesApi = {
  list: () => api.get<{ voices: Voice[]; preferences: VoicePreferences }>('/voices', { auth: true }).then((r) => r.data),
  updatePreferences: (body: Partial<VoicePreferences>) =>
    api.put<{ preferences: VoicePreferences }>('/voices/preferences', body, { auth: true }).then((r) => r.data.preferences),
  preview: (id: string) =>
    api.get<{ url: string }>(`/voices/${id}/preview`, { auth: true, timeoutMs: 60_000 }).then((r) => r.data.url),
  usage: () => api.get<Usage>('/usage', { auth: true }).then((r) => r.data),
};
