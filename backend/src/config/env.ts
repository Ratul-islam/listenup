import 'dotenv/config'
import { z } from 'zod'

const optional = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional())

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_PASS_RESET_SECRET: z.string().min(32),

    SMTP_HOST: z.string().default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().int().default(465),
    SMTP_USER: optional,
    SMTP_PASS: optional,
    SMTP_FROM: optional,

    // Web client ID from Google Cloud; the Android app passes it as serverClientId
    GOOGLE_CLIENT_ID: optional,

    // Base URL this API is reachable at, used to build signed file links
    PUBLIC_URL: z.url().default('http://localhost:8000'),

    // Speech + OCR via OpenRouter. Without a key, development falls back to a
    // local mock voice so the whole pipeline can be exercised for free.
    OPENROUTER_API_KEY: optional,
    TTS_PROVIDER: z.enum(['openrouter', 'mock']).optional(),
    OPENROUTER_OCR_MODEL: z.string().default('google/gemini-2.5-flash-lite'),
    // Cheapest plain English model (Indian English voices), and the multilingual
    // one that also takes emotions (Bangla and the other English voices)
    TTS_MODEL_STANDARD: z.string().default('hexgrad/kokoro-82m'),
    TTS_MODEL_MULTILINGUAL: z.string().default('google/gemini-3.8-flash-lite-tts'),
    // The model that reads Bangla or Hindi typed in English letters. The larger one keeps its accent on
    // lines with English words in them (judged on 4 such lines, Oct 2026: a Bangladeshi accent in 13 of
    // 16 takes, against 8 of 16 for the lite model), at 1.5 times the price. Set it to the same model as
    // TTS_MODEL_MULTILINGUAL to turn this off
    TTS_MODEL_TYPED: z.string().default('google/gemini-3.8-flash-tts'),
    // Cheap text model for "Make it expressive" emotion suggestions
    OPENROUTER_TEXT_MODEL: z.string().default('google/gemini-3.5-flash-lite'),
    // Your own Kokoro server (Kokoro-FastAPI, OpenAI-compatible), e.g. http://kokoro:8880.
    // When set, Natural voices are made there first and fall back to OpenRouter.
    // An empty value (e.g. a blank dashboard field) means "not set"
    KOKORO_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
    // Requests your Kokoro server may have at once (it voices one at a time); more go to OpenRouter
    KOKORO_MAX_IN_FLIGHT: z.coerce.number().int().positive().default(2),
    // Google's Gemini API key (aistudio.google.com, on a paid billing account). When set, Expressive
    // (Gemini) voices are made by Google directly, without OpenRouter's 5.5% fee; OpenRouter stays
    // the fallback. Empty means "not set". GOOGLE_API_KEY is read when this isn't set
    GEMINI_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    // Half-price "flex" tier for audio nobody is waiting on (MP3 exports, offline downloads, podcast).
    // Flex can queue; after GEMINI_FLEX_TIMEOUT_MS the part is made at the standard price instead
    GEMINI_FLEX: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    GEMINI_FLEX_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
    // Google Cloud's Vertex AI: a service account's JSON key (role "Vertex AI User"), either the JSON
    // itself (on a host) or the path of its file (local, e.g. ./vertex-key.json). When set, Expressive
    // voices are made there first: same voices and price as GEMINI_API_KEY, billed to the Cloud project,
    // without the Gemini API's first-tier limit of 100 speech requests a day. Own voices stay on the key
    VERTEX_KEY: optional,
    // The speech models are only served from "global" (Oct 2026: not asia-southeast1 or us-central1)
    VERTEX_LOCATION: z.string().default('global'),
    // "Make it expressive" on Pro: a stronger model follows characters and subtext better
    OPENROUTER_DIRECTOR_PRO_MODEL: z.string().default('google/gemini-3.8-flash'),
    // "Say it yourself": the model that listens to a recorded line. It has to take audio and hear how
    // something is said (the cheap text model described the words' meaning and missed a whisper, Oct 2026)
    OPENROUTER_LISTEN_MODEL: z.string().default('google/gemini-3.8-flash'),
    // Explore's Community: an AI text check before anything is published (the cheap text model).
    // "false" skips it (local testing, or if the model is down); reports and reviews still apply
    COMMUNITY_AI_CHECK: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    // Accounts that review reported publications and set the monthly contest theme, comma-separated
    ADMIN_EMAILS: z
      .string()
      .default('')
      .transform((v) => v.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./storage'),
    S3_BUCKET: optional,
    S3_REGION: z.string().default('auto'),
    S3_ENDPOINT: optional,
    S3_ACCESS_KEY_ID: optional,
    S3_SECRET_ACCESS_KEY: optional,

    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
    // Daily speech spending caps in US dollars (estimated). When free users together reach
    // the first, or everyone the second, new audio pauses until midnight UTC.
    FREE_DAILY_SPEND_CAP_USD: z.coerce.number().positive().default(2),
    // One Free account's share of that a day. A Free user's heaviest real day (a month of
    // minutes, OCR and translation at once) is about $0.30; a usual day is a few cents
    FREE_USER_DAILY_SPEND_USD: z.coerce.number().positive().default(0.25),
    DAILY_SPEND_CAP_USD: z.coerce.number().positive().default(25),

    // Google Play purchases through RevenueCat. The secret API key reads customers' current
    // subscriptions; the webhook secret is the Authorization value set on RevenueCat's webhook.
    REVENUECAT_SECRET_KEY: optional,
    REVENUECAT_WEBHOOK_SECRET: optional,
    // Rewarded ads: true once AdMob's server-side verification callback is set up
    // (<API>/api/v1/ads/rewards/verify). Until then the app reports rewards itself.
    ADMOB_SSV: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    // Android package name, for Google Play links in invites
    ANDROID_PACKAGE: z.string().default('dev.ratul.tts'),
    PORT: z.coerce.number().int().positive().default(8000),
    // How many proxies in front of the API add an X-Forwarded-For entry (Render and Vercel: 1;
    // add one if Cloudflare is put in front). Only those entries are trusted for the client's address
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
    // Prisma's connections per process. Supabase's session pooler allows 15 clients
    // in all, shared by every process (Render, local dev, migrations), so keep the sum
    // of DATABASE_POOL_MAX + QUEUE_POOL_MAX across them under 15
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),
    // pg-boss's own connections (fetching and finishing jobs; the jobs' work uses Prisma's)
    QUEUE_POOL_MAX: z.coerce.number().int().positive().default(3),
    // Run queue workers in this process. Local dev: true. Vercel API: false (a separate
    // always-on process runs `node dist/worker.js` instead)
    RUN_WORKERS: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .refine((e) => e.NODE_ENV !== 'production' || (e.SMTP_USER && e.SMTP_PASS && e.SMTP_FROM), {
    message: 'SMTP_USER, SMTP_PASS and SMTP_FROM are required in production',
    path: ['SMTP_PASS'],
  })
  .refine((e) => e.STORAGE_DRIVER !== 's3' || (e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY), {
    message: 'S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_DRIVER=s3',
    path: ['S3_BUCKET'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.OPENROUTER_API_KEY, {
    message: 'OPENROUTER_API_KEY is required in production',
    path: ['OPENROUTER_API_KEY'],
  })

// Google's own SDKs read the Gemini key as GOOGLE_API_KEY too, so either name works
const parsed = envSchema.safeParse({ ...process.env, GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY })

if (!parsed.success) {
  console.error('Invalid environment variables:\n' + z.prettifyError(parsed.error))
  throw new Error('Invalid environment variables')
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === 'production'

/** Real speech provider when a key exists (or forced), otherwise the free mock voice */
export const ttsProviderName = env.TTS_PROVIDER ?? (env.OPENROUTER_API_KEY ? 'openrouter' : 'mock')
