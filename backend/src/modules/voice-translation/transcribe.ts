import { z } from 'zod'
import { env } from '../../config/env.js'
import { chatCompletion } from '../../lib/openrouter.js'
import { AppError } from '../../utils/AppError.js'
import { LANGS, type Lang } from '../ingestion/text/language.js'

const NAMES: Record<Lang, string> = {
  en: 'English',
  bn: 'Bangla (in Bangla script)',
  hi: 'Hindi (in Devanagari)',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  zh: 'Mandarin Chinese (simplified characters)',
  ur: 'Urdu (in Urdu script)',
  id: 'Indonesian',
}

const SYSTEM = (to: Lang) => `You write down and translate speech for voice dubbing. Listen to the whole recording, then answer only with JSON:
{"language": the language spoken, as one of ${LANGS.join(', ')}, or "other",
 "transcript": every word as it was said, in that language and its usual script, with a blank line wherever the speaker starts a new thought,
 "translation": the same words translated into ${NAMES[to]}, as a native speaker would say them aloud: natural spoken ${NAMES[to].replace(/ \(.*\)$/, '')}, the speaker's own tone, the same paragraphs}
Leave nothing out and add nothing: no notes, no speaker labels, no descriptions of sounds. Names of people, places and brands stay as they are. If nothing is said, both are "".`

const replySchema = z.object({
  language: z.string(),
  transcript: z.string(),
  translation: z.string(),
})

/** What was said in a recording, in its own language and translated, and which language that was */
export interface Heard {
  language: Lang | null
  transcript: string
  translation: string
}

const parse = (reply: string) => {
  const json = reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)
  try {
    return replySchema.parse(JSON.parse(json))
  } catch {
    return null
  }
}

/**
 * Writes down a recording and translates it, in one listen by an audio model (the one that
 * hears "Say it yourself" recordings). Counted against the day's spending caps like other AI.
 */
export async function transcribeAndTranslate(mp3: Buffer, to: Lang, userId: string): Promise<Heard> {
  const reply = await chatCompletion(
    {
      model: env.OPENROUTER_LISTEN_MODEL,
      userId,
      system: SYSTEM(to),
      content: [
        { type: 'text', text: 'The recording:' },
        { type: 'input_audio', input_audio: { data: mp3.toString('base64'), format: 'mp3' } },
      ],
      maxTokens: 16_000,
      json: true,
      reasoning: 'low',
      purpose: 'voice translation',
    },
    5 * 60_000,
  )
  const heard = parse(reply)
  if (!heard) throw new AppError("We couldn't make out the recording. Try again in a moment.", 502, 'PROVIDER_ERROR')
  const language = LANGS.includes(heard.language as Lang) ? (heard.language as Lang) : null
  return { language, transcript: heard.transcript.trim(), translation: heard.translation.trim() }
}
