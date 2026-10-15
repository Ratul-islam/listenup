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
// A cover's link lasts a day: the app keeps the picture, and asks again for a fresh link with each list
export const COVER_URL_TTL_SECONDS = 24 * 60 * 60
// Listening is credited no faster than the clock runs; this much may be caught up at once
// (played offline, or between reports), and no more
export const MAX_LISTEN_REPORT_SECONDS = 120
// A day counts toward the streak after this much listening
export const STREAK_MIN_SECONDS = 60

// Rewarded ads (Free plan): Natural minutes per ad, and ads rewarded per day
// Fewer in reduced-price countries, where an ad view earns a fraction of the minutes' cost
export const AD_REWARD_MINUTES = { standard: 10, reduced: 3 } as const
export const AD_REWARDS_PER_DAY = 3

// Invites: Expressive minutes for both people, and how many invites one person is rewarded for
// Each person's own region decides theirs: in reduced-price countries an invite rarely pays back 10
export const INVITE_REWARD_MINUTES = { standard: 10, reduced: 5 } as const
export const INVITE_MAX_REWARDS = 10
// The friend has listened this long (and verified their email) before the reward is given
export const INVITE_MIN_LISTEN_SEC = 5 * 60
// New accounts can enter a friend's code for this long
export const INVITE_REDEEM_DAYS = 14

// Explore's Community: the longest writing that can be published, and the longest voice clip
export const PUBLISH_MAX_CHARS = 30_000
export const CLIP_MAX_CHARS = 600
// Publications per writer per UTC day
export const WRITINGS_PER_DAY = 5
export const CLIPS_PER_DAY = 10
// Reports from different listeners that hide a publication until it's reviewed
export const REPORTS_TO_HIDE = 3
// Monthly contest: Expressive minutes for 1st, 2nd and 3rd on each board, and the hearts a winner needs
export const CONTEST_PRIZE_MINUTES = [60, 30, 15] as const
export const CONTEST_MIN_HEARTS = 3
// Prizes go out this long after a month ends, so pieces hidden by reports at the last minute can be reviewed first
export const CONTEST_SETTLE_DELAY_HOURS = 24
// A heart counts in the contest only from an account this old with a verified email
export const CONTEST_VOTER_MIN_DAYS = 7
// Before hearting a writing: listen to half of it, or this long, whichever is less
export const HEART_MIN_LISTEN_SEC = 120

// Your own voice (Pro): the reading that's cloned must be this long; anything past the longest is cut off
export const OWN_VOICE_MIN_SEC = 10
export const OWN_VOICE_MAX_SEC = 30
// The consent sentence takes a few seconds to say
export const OWN_VOICE_CONSENT_MIN_SEC = 3
export const OWN_VOICE_CONSENT_MAX_SEC = 30
// Recordings one person can send to be cloned per month (each one is a request to Google)
export const OWN_VOICE_ATTEMPTS_PER_MONTH = 5
// Google keeps 200 stored voices per project; a few are left free for renewing voices
export const OWN_VOICE_CAPACITY = 190
// Google keeps a voice for a year; it's made again from the saved recordings before that
export const OWN_VOICE_RENEW_AFTER_DAYS = 330

// Voice translation (Pro): recordings up to this long are written down, translated and voiced in the speaker's voice
export const VOICE_TRANSLATION_MAX_SEC = 10 * 60
// Translations one person can start a month: each is a long listen by the AI, and a voice made at Google
export const VOICE_TRANSLATIONS_PER_MONTH = 20
