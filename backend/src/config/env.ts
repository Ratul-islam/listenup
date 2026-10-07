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
    // the fallback. Empty means "not set"
    GEMINI_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    // Half-price "flex" tier for audio nobody is waiting on (MP3 exports, offline downloads, podcast).
    // Flex can queue; after GEMINI_FLEX_TIMEOUT_MS the part is made at the standard price instead
    GEMINI_FLEX: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    GEMINI_FLEX_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
    // "Make it expressive" on Pro: a stronger model follows characters and subtext better
    OPENROUTER_DIRECTOR_PRO_MODEL: z.string().default('google/gemini-3.8-flash'),

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

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:\n' + z.prettifyError(parsed.error))
  throw new Error('Invalid environment variables')
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === 'production'

/** Real speech provider when a key exists (or forced), otherwise the free mock voice */
export const ttsProviderName = env.TTS_PROVIDER ?? (env.OPENROUTER_API_KEY ? 'openrouter' : 'mock')
