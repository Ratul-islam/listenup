export const API_PREFIX = '/api/v1'
export const APP_NAME = 'TTS'

// JWT lifetimes
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60
export const RESET_TOKEN_TTL = '2m'

// A closed account can be restored by signing in for this long, then it's erased
export const ACCOUNT_GRACE_DAYS = 30

// Email OTPs
export const OTP_LENGTH = 6
export const OTP_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5
export const OTP_RESEND_COOLDOWN_SECONDS = 60

// Documents
export const ALLOWED_UPLOADS: Record<string, { kind: 'PDF' | 'DOCX' | 'EPUB' | 'TEXT' | 'MARKDOWN' | 'IMAGE'; mime: string }> = {
  pdf: { kind: 'PDF', mime: 'application/pdf' },
  docx: { kind: 'DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  epub: { kind: 'EPUB', mime: 'application/epub+zip' },
  txt: { kind: 'TEXT', mime: 'text/plain' },
  md: { kind: 'MARKDOWN', mime: 'text/markdown' },
  markdown: { kind: 'MARKDOWN', mime: 'text/markdown' },
  jpg: { kind: 'IMAGE', mime: 'image/jpeg' },
  jpeg: { kind: 'IMAGE', mime: 'image/jpeg' },
  png: { kind: 'IMAGE', mime: 'image/png' },
  webp: { kind: 'IMAGE', mime: 'image/webp' },
  heic: { kind: 'IMAGE', mime: 'image/heic' },
}
export const MAX_DOCUMENT_CHARS = 2_000_000
export const MAX_PASTE_CHARS = 200_000

// Speech chunks: the first one is short so playback starts quickly
export const FIRST_CHUNK_CHARS = 180
export const CHUNK_TARGET_CHARS = 420
export const CHUNK_MAX_CHARS = 700
// Reading speed at 1x, for estimates before audio exists
export const CHARS_PER_SECOND = { en: 14.5, bn: 12, hi: 13, es: 15, pt: 15, fr: 15, it: 15, ja: 7, zh: 4.5, ur: 12, id: 15 } as const
// Chunks generated ahead of the one requested
export const PREFETCH_CHUNKS = 2

export const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60
// Upper bound accepted per progress report, so stats can't be inflated
export const MAX_LISTEN_REPORT_SECONDS = 120
// A day counts toward the streak after this much listening
export const STREAK_MIN_SECONDS = 60

// Rewarded ads (Free plan): Natural minutes per ad, and ads rewarded per day
export const AD_REWARD_MINUTES = 10
export const AD_REWARDS_PER_DAY = 3

// Invites: Expressive minutes for both people, and how many invites one person is rewarded for
export const INVITE_REWARD_MINUTES = 10
export const INVITE_MAX_REWARDS = 10
// The friend has listened this long (and verified their email) before the reward is given
export const INVITE_MIN_LISTEN_SEC = 5 * 60
// New accounts can enter a friend's code for this long
export const INVITE_REDEEM_DAYS = 14
