import { z } from 'zod'
import { env } from '../../config/env.js'
import { chatCompletion } from '../../lib/openrouter.js'
import { AppError } from '../../utils/AppError.js'
import type { PlatformId } from './studio-catalog.js'

/** What to post with a video: written for its platform, in the script's language */
export interface PostCopy {
  platform: PlatformId
  /** YouTube's title (other platforms have none) */
  title: string | null
  /** The post's text, or YouTube's description */
  caption: string
  /** With their #, in the order to paste them */
  hashtags: string[]
  /** YouTube's keyword tags, without # */
  tags: string[]
  /** A few words to put on the first frame of a vertical video, so it reads in the feed */
  coverText: string | null
  madeAt: string
}

// What each platform's post needs. Lengths keep the important part above "more" (Oct 2026: TikTok and
// Instagram show about the first line or two of a caption; YouTube cuts titles past about 70 characters in search)
const RULES: Record<PlatformId, string> = {
  tiktok:
    'TikTok. caption: one or two short lines, at most 150 characters, that make people watch to the end (a question or a tease, not a summary). hashtags: 3 to 5, one or two broad and the rest specific to the topic. coverText: at most 6 words for the first frame. title: null. tags: [].',
  reels:
    'Instagram Reels. caption: two or three short lines with a call to action at the end (save, share or comment). hashtags: 5 to 8, specific to the topic. coverText: at most 6 words for the first frame. title: null. tags: [].',
  facebook:
    'Facebook. caption: two or three sentences ending in a question that invites comments. hashtags: 2 or 3. coverText: at most 6 words for the first frame. title: null. tags: [].',
  shorts:
    'YouTube Shorts. title: at most 60 characters, curious but honest, no clickbait. caption: the description, one or two lines. hashtags: 3, the first one #Shorts. coverText: null. tags: 5 to 8 search keywords.',
  youtube:
    'YouTube (a long video). title: at most 70 characters, specific and honest, the main keyword early. caption: the description: two lines that make people want to watch, then a short paragraph on what the video covers. hashtags: 3. coverText: null. tags: 8 to 12 search keywords.',
  podcast: 'A podcast episode. title: at most 70 characters. caption: show notes, two or three sentences. hashtags: []. coverText: null. tags: [].',
  audiobook: 'An audiobook. title: the book title. caption: a two or three sentence blurb. hashtags: []. coverText: null. tags: [].',
}

const SYSTEM = `You write social media posts for creators' videos, from the script of the voiceover. Answer only with JSON:
{"title": string or null, "caption": string, "hashtags": [strings starting with #], "tags": [strings], "coverText": string or null}
Write in the language you're told the script is in (hashtags and tags may also be in English where that's what people search). Spell every word correctly. Sound like a person, not an advert: no emoji walls, at most two emoji, no "Unlock", "Dive into", "Discover the secrets". Don't promise what the script doesn't deliver. Hashtags have no spaces.`

const replySchema = z.object({
  title: z.string().nullish(),
  caption: z.string(),
  hashtags: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  coverText: z.string().nullish(),
})

const NAMES: Record<string, string> = {
  en: 'English',
  bn: 'Bangla, in Bangla script',
  hi: 'Hindi, in Devanagari',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  zh: 'Chinese',
  ur: 'Urdu',
  id: 'Indonesian',
}

/** The language to write in, said outright: left to itself the model once wrote an English story's caption in Bangla (it mentioned Dhaka) */
const languageName = (language: string | null) => (language && NAMES[language]) || 'the main language of the script'

const hashtag = (h: string) => `#${h.replace(/^#+/, '').replace(/\s+/g, '')}`

/** A post's title, caption, hashtags and cover text for one platform, from a script */
export async function writePost(script: string, platform: PlatformId, userId: string, language: string | null): Promise<PostCopy> {
  const reply = await chatCompletion({
    // The small model misspelt Bangla tags ("মাদুর" for "মধুর", twice in two tries, Oct 2026); other languages get the stronger one
    model: language === 'en' ? env.OPENROUTER_TEXT_MODEL : env.OPENROUTER_DIRECTOR_PRO_MODEL,
    userId,
    system: SYSTEM,
    content: [{ type: 'text', text: `Platform: ${RULES[platform]}\n\nWrite the post in ${languageName(language)}.\n\nThe script:\n${script.slice(0, 8000)}` }],
    maxTokens: 1200,
    json: true,
    purpose: 'post copy',
  })
  let parsed: z.infer<typeof replySchema>
  try {
    parsed = replySchema.parse(JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)))
  } catch {
    throw new AppError("We couldn't write the post just now. Try again.", 502, 'PROVIDER_ERROR')
  }
  const youtube = platform === 'youtube' || platform === 'shorts'
  return {
    platform,
    title: youtube || platform === 'podcast' || platform === 'audiobook' ? (parsed.title?.trim() || null) : null,
    caption: parsed.caption.trim(),
    hashtags: [...new Set(parsed.hashtags.map(hashtag).filter((h) => h.length > 1))].slice(0, 12),
    tags: youtube ? [...new Set(parsed.tags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean))].slice(0, 15) : [],
    coverText: youtube ? null : (parsed.coverText?.trim() || null),
    madeAt: new Date().toISOString(),
  }
}
