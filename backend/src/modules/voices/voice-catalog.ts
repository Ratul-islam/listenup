import { env } from '../../config/env.js'
import type { Lang } from '../ingestion/text/language.js'

export type VoiceTier = 'phone' | 'natural' | 'expressive'
/** Levels voiced (and paid for) on the server */
export type ServerTier = Exclude<VoiceTier, 'phone'>

export interface VoiceDefinition {
  id: string
  name: string
  language: Lang
  accent: string
  style: string
  /** 'varies' for phone voices, which depend on the device */
  gender: 'female' | 'male' | 'varies'
  /**
   * What the voice costs, which decides the allowance it uses. Phone voices are
   * the device's own text-to-speech: free, offline and unlimited, voiced in the
   * app, never here. Natural (Kokoro, about $0.03 an hour) reads plainly;
   * Expressive (Gemini, about $0.58 an hour, $1.16 from 2027) takes emotions.
   */
  tier: VoiceTier
  model: string
  providerVoice: string
  /** Can take emotions and sounds: true for Expressive voices */
  expressive: boolean
  /** Accent direction appended to every delivery style, e.g. "in a British English accent" */
  accentStyle?: string
}

// Model name for phone voices, which the app voices itself
export const PHONE_MODEL = 'device'

const standard = env.TTS_MODEL_STANDARD
const multilingual = env.TTS_MODEL_MULTILINGUAL

const american = 'in an American English accent'
const british = 'in a British English accent'
const hindi = 'in natural, fluent Hindi'
const spanish = 'in natural Latin American Spanish'
const portuguese = 'in natural Brazilian Portuguese'
const french = 'in natural French from France'
const italian = 'in natural Italian from Italy'
const japanese = 'in natural, standard Japanese'
const mandarin = 'in natural Mandarin Chinese (Putonghua)'
const urdu = 'in natural, fluent Urdu'
const indonesian = 'in natural Indonesian'

const phone = (language: Lang) =>
  voice({ id: `phone-${language}`, name: 'Phone voice', language, accent: 'This phone', style: 'Free, works offline', gender: 'varies', tier: 'phone', model: PHONE_MODEL, providerVoice: '' })

/**
 * Built-in voices. Each maps to an OpenRouter model + provider voice, so the
 * mapping can change without touching clients. English defaults to a Natural
 * voice to keep costs down; Expressive voices are opt-in.
 *
 * Chosen by testing (Oct 2026), with speech-to-text and an audio model as judge.
 * Gemini Flash Lite TTS speaks Bangla well and takes emotions, so most voices use
 * it; its accent follows the style direction for American and British English.
 * Indian English held only about a third of the time, so the Indian voices stay
 * on Kokoro (cheapest, word-perfect, but no emotions). Bangla voices are
 * distinguished by voice, not accent.
 */
const voice = (v: Omit<VoiceDefinition, 'expressive'>): VoiceDefinition => ({ ...v, expressive: v.tier === 'expressive' })

export const VOICES: VoiceDefinition[] = [
  voice({ id: 'ivy', name: 'Ivy', language: 'en', accent: 'American', style: 'Warm & clear', gender: 'female', tier: 'natural', model: standard, providerVoice: 'af_heart' }),
  voice({ id: 'bella', name: 'Bella', language: 'en', accent: 'American', style: 'Bright & friendly', gender: 'female', tier: 'natural', model: standard, providerVoice: 'af_bella' }),
  voice({ id: 'miles', name: 'Miles', language: 'en', accent: 'American', style: 'Calm & steady', gender: 'male', tier: 'natural', model: standard, providerVoice: 'am_michael' }),
  voice({ id: 'emma', name: 'Emma', language: 'en', accent: 'British', style: 'Soft & polished', gender: 'female', tier: 'natural', model: standard, providerVoice: 'bf_emma' }),
  voice({ id: 'george', name: 'George', language: 'en', accent: 'British', style: 'Measured narrator', gender: 'male', tier: 'natural', model: standard, providerVoice: 'bm_george' }),
  voice({ id: 'arjun', name: 'Arjun', language: 'en', accent: 'Indian', style: 'Clear & friendly', gender: 'male', tier: 'natural', model: standard, providerVoice: 'hm_omega' }),
  voice({ id: 'maya', name: 'Maya', language: 'en', accent: 'Indian', style: 'Soft & warm', gender: 'female', tier: 'natural', model: standard, providerVoice: 'hf_beta' }),
  voice({ id: 'nova', name: 'Nova', language: 'en', accent: 'American', style: 'Warm & natural', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Sulafat', accentStyle: american }),
  voice({ id: 'breeze', name: 'Breeze', language: 'en', accent: 'American', style: 'Bright & upbeat', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Zephyr', accentStyle: american }),
  voice({ id: 'atlas', name: 'Atlas', language: 'en', accent: 'American', style: 'Deep & steady', gender: 'male', tier: 'expressive', model: multilingual, providerVoice: 'Alnilam', accentStyle: american }),
  voice({ id: 'eleanor', name: 'Eleanor', language: 'en', accent: 'British', style: 'Warm studio', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Despina', accentStyle: british }),
  voice({ id: 'oliver', name: 'Oliver', language: 'en', accent: 'British', style: 'Calm narrator', gender: 'male', tier: 'expressive', model: multilingual, providerVoice: 'Schedar', accentStyle: british }),
  phone('en'),
  voice({ id: 'nusrat', name: 'Nusrat', language: 'bn', accent: 'Bangla', style: 'Soft & clear', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Kore' }),
  voice({ id: 'rafi', name: 'Rafi', language: 'bn', accent: 'Bangla', style: 'Warm storyteller', gender: 'male', tier: 'expressive', model: multilingual, providerVoice: 'Charon' }),
  voice({ id: 'tanisha', name: 'Tanisha', language: 'bn', accent: 'Bangla', style: 'Bright & expressive', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Aoede' }),
  phone('bn'),

  // Hindi, Spanish, Portuguese (Brazil) and French: Natural voices are the default
  voice({ id: 'priya', name: 'Priya', language: 'hi', accent: 'Hindi', style: 'Warm & clear', gender: 'female', tier: 'natural', model: standard, providerVoice: 'hf_alpha' }),
  voice({ id: 'kabir', name: 'Kabir', language: 'hi', accent: 'Hindi', style: 'Calm & steady', gender: 'male', tier: 'natural', model: standard, providerVoice: 'hm_psi' }),
  voice({ id: 'meera', name: 'Meera', language: 'hi', accent: 'Hindi', style: 'Soft & expressive', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Leda', accentStyle: hindi }),
  voice({ id: 'arnav', name: 'Arnav', language: 'hi', accent: 'Hindi', style: 'Warm storyteller', gender: 'male', tier: 'expressive', model: multilingual, providerVoice: 'Iapetus', accentStyle: hindi }),
  phone('hi'),
  voice({ id: 'lucia', name: 'Lucía', language: 'es', accent: 'Spanish', style: 'Bright & clear', gender: 'female', tier: 'natural', model: standard, providerVoice: 'ef_dora' }),
  voice({ id: 'mateo', name: 'Mateo', language: 'es', accent: 'Spanish', style: 'Calm & steady', gender: 'male', tier: 'natural', model: standard, providerVoice: 'em_alex' }),
  voice({ id: 'valeria', name: 'Valeria', language: 'es', accent: 'Latin American', style: 'Warm & expressive', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Callirrhoe', accentStyle: spanish }),
  voice({ id: 'diego', name: 'Diego', language: 'es', accent: 'Latin American', style: 'Deep storyteller', gender: 'male', tier: 'expressive', model: multilingual, providerVoice: 'Orus', accentStyle: spanish }),
  phone('es'),
  voice({ id: 'beatriz', name: 'Beatriz', language: 'pt', accent: 'Brazilian', style: 'Bright & clear', gender: 'female', tier: 'natural', model: standard, providerVoice: 'pf_dora' }),
  voice({ id: 'thiago', name: 'Thiago', language: 'pt', accent: 'Brazilian', style: 'Calm & steady', gender: 'male', tier: 'natural', model: standard, providerVoice: 'pm_alex' }),
  voice({ id: 'luana', name: 'Luana', language: 'pt', accent: 'Brazilian', style: 'Warm & expressive', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Laomedeia', accentStyle: portuguese }),
  voice({ id: 'rafael', name: 'Rafael', language: 'pt', accent: 'Brazilian', style: 'Friendly storyteller', gender: 'male', tier: 'expressive', model: multilingual, providerVoice: 'Algieba', accentStyle: portuguese }),
  phone('pt'),
  voice({ id: 'camille', name: 'Camille', language: 'fr', accent: 'French', style: 'Soft & clear', gender: 'female', tier: 'natural', model: standard, providerVoice: 'ff_siwis' }),
  voice({ id: 'elise', name: 'Élise', language: 'fr', accent: 'French', style: 'Warm & expressive', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Erinome', accentStyle: french }),
  voice({ id: 'louis', name: 'Louis', language: 'fr', accent: 'French', style: 'Calm narrator', gender: 'male', tier: 'expressive', model: multilingual, providerVoice: 'Algenib', accentStyle: french }),
  phone('fr'),

  // Italian, Japanese, Mandarin, Urdu and Indonesian (Oct 2026). Kokoro has no Urdu or
  // Indonesian voices, so those languages start on Expressive, like Bangla.
  voice({ id: 'sara', name: 'Sara', language: 'it', accent: 'Italian', style: 'Bright & clear', gender: 'female', tier: 'natural', model: standard, providerVoice: 'if_sara' }),
  voice({ id: 'nicola', name: 'Nicola', language: 'it', accent: 'Italian', style: 'Calm & steady', gender: 'male', tier: 'natural', model: standard, providerVoice: 'im_nicola' }),
  voice({ id: 'giulia', name: 'Giulia', language: 'it', accent: 'Italian', style: 'Gentle & warm', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Vindemiatrix', accentStyle: italian }),
  voice({ id: 'marco', name: 'Marco', language: 'it', accent: 'Italian', style: 'Clear narrator', gender: 'male', tier: 'expressive', model: multilingual, providerVoice: 'Rasalgethi', accentStyle: italian }),
  phone('it'),
  voice({ id: 'hana', name: 'Hana', language: 'ja', accent: 'Japanese', style: 'Soft & clear', gender: 'female', tier: 'natural', model: standard, providerVoice: 'jf_alpha' }),
  voice({ id: 'ken', name: 'Ken', language: 'ja', accent: 'Japanese', style: 'Calm & steady', gender: 'male', tier: 'natural', model: standard, providerVoice: 'jm_kumo' }),
  voice({ id: 'yui', name: 'Yui', language: 'ja', accent: 'Japanese', style: 'Bright & clear', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Autonoe', accentStyle: japanese }),
  voice({ id: 'haruto', name: 'Haruto', language: 'ja', accent: 'Japanese', style: 'Easygoing narrator', gender: 'male', tier: 'expressive', model: multilingual, providerVoice: 'Umbriel', accentStyle: japanese }),
  phone('ja'),
  voice({ id: 'xiaoxiao', name: 'Xiaoxiao', language: 'zh', accent: 'Mandarin', style: 'Warm & clear', gender: 'female', tier: 'natural', model: standard, providerVoice: 'zf_xiaoxiao' }),
  voice({ id: 'yunxi', name: 'Yunxi', language: 'zh', accent: 'Mandarin', style: 'Calm & steady', gender: 'male', tier: 'natural', model: standard, providerVoice: 'zm_yunxi' }),
  voice({ id: 'mei', name: 'Mei', language: 'zh', accent: 'Mandarin', style: 'Clear & confident', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Pulcherrima', accentStyle: mandarin }),
  voice({ id: 'wei', name: 'Wei', language: 'zh', accent: 'Mandarin', style: 'Soft narrator', gender: 'male', tier: 'expressive', model: multilingual, providerVoice: 'Enceladus', accentStyle: mandarin }),
  phone('zh'),
  voice({ id: 'ayesha', name: 'Ayesha', language: 'ur', accent: 'Urdu', style: 'Soft & clear', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Achernar', accentStyle: urdu }),
  voice({ id: 'bilal', name: 'Bilal', language: 'ur', accent: 'Urdu', style: 'Lively storyteller', gender: 'male', tier: 'expressive', model: multilingual, providerVoice: 'Sadachbia', accentStyle: urdu }),
  phone('ur'),
  voice({ id: 'sari', name: 'Sari', language: 'id', accent: 'Indonesian', style: 'Warm & mature', gender: 'female', tier: 'expressive', model: multilingual, providerVoice: 'Gacrux', accentStyle: indonesian }),
  voice({ id: 'budi', name: 'Budi', language: 'id', accent: 'Indonesian', style: 'Friendly & clear', gender: 'male', tier: 'expressive', model: multilingual, providerVoice: 'Achird', accentStyle: indonesian }),
  phone('id'),
]

export const DEFAULT_VOICE: Record<Lang, string> = {
  en: 'ivy',
  bn: 'nusrat',
  hi: 'priya',
  es: 'lucia',
  pt: 'beatriz',
  fr: 'camille',
  it: 'sara',
  ja: 'hana',
  zh: 'xiaoxiao',
  ur: 'ayesha',
  id: 'sari',
}

const byId = new Map(VOICES.map((v) => [v.id, v]))

export const findVoice = (id: string | null | undefined) => (id ? byId.get(id) : undefined)

/** Voiced on the server (Natural or Expressive), as opposed to the phone's own voice */
export const isServerVoice = (voice: VoiceDefinition): voice is VoiceDefinition & { tier: ServerTier } => voice.tier !== 'phone'

export const PREVIEW_TEXT: Record<Lang, string> = {
  en: "Hi, I'm here to read your articles, notes and books aloud, whenever you're ready.",
  bn: 'আমি আপনার লেখা, নোট আর বই পড়ে শোনাতে প্রস্তুত। যখন খুশি শুরু করুন।',
  hi: 'नमस्ते, मैं आपके लेख, नोट्स और किताबें पढ़कर सुनाने के लिए तैयार हूँ। जब चाहें, शुरू करें।',
  es: 'Hola, estoy aquí para leerte en voz alta tus artículos, notas y libros, cuando quieras.',
  pt: 'Olá, estou aqui para ler em voz alta seus artigos, notas e livros, quando você quiser.',
  fr: 'Bonjour, je suis là pour vous lire à voix haute vos articles, notes et livres, quand vous voulez.',
  it: 'Ciao, sono qui per leggerti ad alta voce articoli, appunti e libri, quando vuoi.',
  ja: 'こんにちは。あなたの記事やメモ、本を、いつでも読み上げます。',
  zh: '你好，我可以随时为你朗读文章、笔记和书籍。',
  ur: 'السلام علیکم، میں جب چاہیں آپ کے مضامین، نوٹس اور کتابیں پڑھ کر سنا سکتی ہوں۔',
  id: 'Halo, saya siap membacakan artikel, catatan, dan buku Anda kapan saja.',
}
