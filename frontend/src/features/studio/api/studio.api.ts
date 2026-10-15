import { api } from '@/lib/api/client';

export type PlatformId = 'youtube' | 'shorts' | 'tiktok' | 'reels' | 'facebook' | 'podcast' | 'audiobook';
export type NarrationTypeId = 'explainer' | 'storytelling' | 'documentary' | 'news' | 'promo' | 'motivational' | 'review' | 'conversational' | 'calm';
export type ToneId = 'warm' | 'energetic' | 'calm' | 'serious' | 'conversational' | 'dramatic' | 'inspiring' | 'playful';
export type SubtitleStyle = 'srt' | 'shortSrt' | 'wordsSrt' | 'none';
export type PageId = 'tiktok' | 'meta' | 'youtube';
export type FormatId = 'storytime' | 'pov' | 'facts' | 'reddit' | 'top3' | 'tip' | 'aesthetic' | 'motivational' | 'promo' | 'howto' | 'shortsFact' | 'documentary' | 'tutorial' | 'essay' | 'review';

/** What Studio offers, from the server, so the app and the voices agree */
export interface StudioCatalog {
  /** The platform pages in Studio, each with its narration styles */
  pages: { id: PageId; label: string; about: string; platforms: PlatformId[]; formats: FormatId[] }[];
  /** Narration styles made for a platform: how the voice says it, how long it runs, and a template */
  formats: { id: FormatId; label: string; about: string; platform: PlatformId; speed: number; lengthSec: [number, number]; templates: { en: string; bn: string } }[];
  platforms: { id: PlatformId; label: string; types: NarrationTypeId[]; maxSec: number | null; loudness: string; subtitles: SubtitleStyle }[];
  types: { id: NarrationTypeId; label: string; speed: number; templates: { en: string; bn: string } }[];
  tones: { id: ToneId; label: string }[];
  speed: { min: number; max: number };
  pitch: { min: number; max: number };
}

/** A script's choices; null clears one, leaving one out keeps it */
export interface StudioSettings {
  platform?: PlatformId | null;
  /** A narration style made for a platform; it takes the place of `type` */
  format?: FormatId | null;
  type?: NarrationTypeId | null;
  tone?: ToneId | null;
  customTone?: string | null;
  speed?: number | null;
  pitch?: number | null;
}

/** What to post with the video, written for one platform */
export interface PostCopy {
  platform: PlatformId;
  title: string | null;
  caption: string;
  hashtags: string[];
  tags: string[];
  coverText: string | null;
  madeAt: string;
}

/** A script's choices as the server returns them, with its platform's guidance */
export interface StudioView extends Required<StudioSettings> {
  /** Captions, hashtags and titles written for the script, by platform */
  posts: Partial<Record<PlatformId, PostCopy>>;
  /** What the voice is told and set to, after the narration type and the creator's own choices */
  delivery: { style?: string; speed?: number; pitch?: number } | null;
  guide: {
    maxSec: number | null;
    loudness: { label: string; lufs: number; peakDb: number };
    subtitles: SubtitleStyle;
    disclosure: { note: string; url: string } | null;
  } | null;
}

export const studioApi = {
  catalog: () => api.get<StudioCatalog>('/studio/catalog', { auth: true }).then((r) => r.data),
  /** Writes the caption, hashtags (and for YouTube a title and tags) for a platform; kept with the script */
  writePost: (documentId: string, platform?: PlatformId) =>
    api.post<{ post: PostCopy; studio: StudioView }>(`/documents/${documentId}/post`, { platform }, { auth: true, timeoutMs: 60_000 }).then((r) => r.data),
  /** Saves a script's choices; parts whose sound changes are voiced again when next played or exported */
  update: (documentId: string, settings: StudioSettings) =>
    api.patch<{ studio: StudioView; partsChanged: number }>(`/documents/${documentId}/studio`, settings, { auth: true }).then((r) => r.data),
};
