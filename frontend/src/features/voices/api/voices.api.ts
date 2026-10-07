import { api } from '@/lib/api/client';
import type { Lang } from '@/lib/languages';

export interface Voice {
  id: string;
  name: string;
  language: Lang;
  accent: string;
  style: string;
  /** 'varies' for phone voices, which depend on the device */
  gender: 'female' | 'male' | 'varies';
  /**
   * Phone voices are the device's own (free, offline, voiced in the app); Natural voices read
   * plainly; Expressive ones take emotions and use Expressive minutes
   */
  tier: VoiceTier;
  /** Can speak with emotions */
  expressive: boolean;
  /** Kokoro speaker for voicing it on this phone, once Natural voices are downloaded here */
  deviceVoice: string | null;
}

/** The Kokoro package for voicing Natural voices on the phone */
export type OnDeviceModel =
  | { available: false }
  | { available: true; version: number; bytes: number; unpackedBytes: number; sha256: string; speakers: string[]; url: string };

export type VoiceTier = 'phone' | 'natural' | 'expressive';

export interface VoicePreferences {
  /** Preferred voice per language */
  voices: Record<Lang, string>;
  speed: number;
  dailyGoalMinutes: number;
  /** Start the next unfinished shelf item when one finishes */
  autoPlayNext: boolean;
}

export interface TierUsage {
  usedSec: number;
  limitSec: number;
  remainingSec: number;
}

/** Seconds of newly made audio this month, per voice level. Replays and shared audio are free. */
/** Only the voices given change */
export type PreferencesUpdate = Partial<Omit<VoicePreferences, 'voices'>> & { voices?: Partial<Record<Lang, string>> };

export interface Usage {
  period: string;
  /** "YYYY-MM-DD" when monthly minutes reset */
  resetsOn: string;
  plan: {
    id: string;
    name: string;
    /** When the paid period ends (ISO), and whether it renews then */
    expiresAt: string | null;
    renews: boolean;
  };
  natural: TierUsage;
  expressive: TierUsage & {
    /** Studio-pack seconds, included in remainingSec */
    bonusSec: number;
    /** The Expressive minutes are a one-time trial (Free) */
    trial: boolean;
  };
}

export const voicesApi = {
  list: () => api.get<{ voices: Voice[]; preferences: VoicePreferences }>('/voices', { auth: true }).then((r) => r.data),
  updatePreferences: (body: PreferencesUpdate) =>
    api.put<{ preferences: VoicePreferences }>('/voices/preferences', body, { auth: true }).then((r) => r.data.preferences),
  preview: (id: string) =>
    api.get<{ url: string }>(`/voices/${id}/preview`, { auth: true, timeoutMs: 60_000 }).then((r) => r.data.url),
  usage: () => api.get<Usage>('/usage', { auth: true }).then((r) => r.data),
  onDeviceModel: () => api.get<OnDeviceModel>('/voices/on-device', { auth: true }).then((r) => r.data),
};
