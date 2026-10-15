import { AppError } from '../../utils/AppError.js'
import { LOUDNESS, NARRATION_TYPES, PITCH_RANGE, PLATFORMS, SPEED_RANGE, TONES, partDelivery, readStudio, type StudioSettings } from './studio-catalog.js'
import type { StudioRepository } from './studio.repository.js'
import type { PostBody, StudioSettingsBody } from './studio.schema.js'
import { writePost, type PostCopy } from './studio-post.js'
import { FORMATS, PAGES } from './studio-formats.js'
import { TEMPLATES } from './studio-templates.js'

/** Where a platform's AI-voice rules are, for the reminder at export (checked Oct 2026) */
const DISCLOSURES = {
  youtube: {
    note: 'YouTube asks you to turn on “altered or synthetic content” when an AI voice could be mistaken for a real person. Your own cloned voice reading your own script doesn’t need it.',
    url: 'https://support.google.com/youtube/answer/14328491',
  },
  tiktok: { note: 'TikTok asks you to turn on its AI-generated content label for realistic AI voices.', url: 'https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content' },
  meta: {
    note: 'Instagram and Facebook require you to add the “AI info” label before sharing a reel with a realistic AI voiceover. Sharing without it can be penalised.',
    url: 'https://help.instagram.com/761121959519495',
  },
} as const

/** A script's settings as the app shows them, with the platform's guidance spelled out */
export function studioView(value: unknown) {
  const settings = readStudio(value)
  const platform = settings.platform ? PLATFORMS[settings.platform] : null
  const posts = (value as { posts?: Partial<Record<string, PostCopy>> } | null)?.posts ?? {}
  return {
    ...settings,
    /** Captions, hashtags and titles written for the script, by platform */
    posts,
    /** What the voice is told and set to, after the narration type and the creator's own choices */
    delivery: partDelivery(settings),
    guide: platform
      ? {
          maxSec: platform.maxSec,
          loudness: LOUDNESS[platform.loudness],
          subtitles: platform.subtitles,
          disclosure: platform.disclosure ? DISCLOSURES[platform.disclosure] : null,
        }
      : null,
  }
}

export class StudioService {
  constructor(private readonly studioRepository: StudioRepository) {}

  /** Everything the app offers: platforms, narration types, tones, the ranges and the templates */
  catalog() {
    return {
      /** The platform pages in Studio, each with its narration styles */
      pages: Object.entries(PAGES).map(([id, p]) => ({ id, label: p.label, about: p.about, platforms: p.platforms, formats: p.formats })),
      formats: Object.entries(FORMATS).map(([id, f]) => ({ id, label: f.label, about: f.about, platform: f.platform, speed: f.speed, lengthSec: f.lengthSec, templates: f.templates })),
      platforms: Object.entries(PLATFORMS).map(([id, p]) => ({ id, label: p.label, types: p.types, maxSec: p.maxSec, loudness: p.loudness, subtitles: p.subtitles })),
      types: Object.entries(NARRATION_TYPES).map(([id, t]) => ({ id, label: t.label, speed: t.speed, templates: TEMPLATES[id as keyof typeof TEMPLATES] })),
      tones: Object.entries(TONES).map(([id, t]) => ({ id, label: t.label })),
      speed: SPEED_RANGE,
      pitch: PITCH_RANGE,
    }
  }

  /**
   * Changes a script's settings: what's sent replaces what was there (null clears it). Parts
   * whose voice settings change are voiced again the next time they're played or exported;
   * locked parts keep theirs.
   */
  async update(userId: string, documentId: string, body: StudioSettingsBody) {
    const doc = await this.studioRepository.findOwned(userId, documentId)
    if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
    if (doc.publicationId) throw new AppError("A writer's work from Explore is read the way they published it.", 403, 'FROM_COMMUNITY')
    const stored = (doc.studio && typeof doc.studio === 'object' ? doc.studio : {}) as Record<string, unknown>
    const next = readStudio({ ...stored, ...body }) as StudioSettings
    // A preset and their own words are one choice: picking one clears the other. So are a platform's style and a kind of narration
    if (body.tone) next.customTone = null
    if (body.customTone) next.tone = null
    if (body.format) next.type = null
    if (body.type) next.format = null
    // A style picked without a platform brings its own
    if (next.format && !next.platform) next.platform = FORMATS[next.format].platform
    const partsChanged = await this.studioRepository.save(documentId, { ...stored, ...next }, partDelivery(next))
    return { studio: studioView({ ...stored, ...next }), partsChanged }
  }

  /**
   * What to post with the video: a caption, hashtags, and for YouTube a title and tags, written
   * by AI from the script for one platform (the script's own unless another is asked for), and
   * kept with it. Writing it again replaces that platform's.
   */
  async writePost(userId: string, documentId: string, { platform }: PostBody) {
    const doc = await this.studioRepository.scriptOf(userId, documentId)
    if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
    if (doc.status !== 'READY' || !doc.text.trim()) throw new AppError('This script is still being prepared', 409, 'DOCUMENT_NOT_READY')
    const stored = (doc.studio && typeof doc.studio === 'object' ? doc.studio : {}) as Record<string, unknown>
    const target = platform ?? readStudio(stored).platform ?? 'tiktok'
    const post = await writePost(doc.text, target, userId, doc.language)
    const next = { ...stored, posts: { ...((stored.posts as object | undefined) ?? {}), [target]: post } }
    await this.studioRepository.saveStudio(documentId, next)
    return { post, studio: studioView(next) }
  }
}
