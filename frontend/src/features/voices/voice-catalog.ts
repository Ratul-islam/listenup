/**
 * Display data for the built-in voices, used before sign-in (onboarding) and
 * as a fallback. The server's /voices endpoint is the source of truth once
 * signed in.
 */
export interface VoicePreview {
  id: string;
  name: string;
  language: 'en' | 'bn';
  accent: string;
  style: string;
}

export const featuredVoices: VoicePreview[] = [
  { id: 'nova', name: 'Nova', language: 'en', accent: 'American', style: 'Warm & natural' },
  { id: 'oliver', name: 'Oliver', language: 'en', accent: 'British', style: 'Calm narrator' },
  { id: 'arjun', name: 'Arjun', language: 'en', accent: 'Indian', style: 'Clear & friendly' },
  { id: 'nusrat', name: 'Nusrat', language: 'bn', accent: 'বাংলা', style: 'কোমল ও স্পষ্ট' },
];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
