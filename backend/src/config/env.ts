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

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./storage'),
    S3_BUCKET: optional,
    S3_REGION: z.string().default('auto'),
    S3_ENDPOINT: optional,
    S3_ACCESS_KEY_ID: optional,
    S3_SECRET_ACCESS_KEY: optional,

    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
    FREE_TIER_MONTHLY_CHARS: z.coerce.number().int().positive().default(300_000),
    // Run queue workers in this process (split API and workers in production if needed)
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
