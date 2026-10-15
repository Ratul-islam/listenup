import type { ServerTier } from '../voices/voice-catalog.js'

export type PlanId = 'free' | 'plus' | 'pro'

/** Where the subscription was bought: reduced allowances go with Play's lower local prices */
export type AllowanceRegion = 'standard' | 'reduced'

export interface Allowance {
  /** Minutes of newly made Natural-voice audio per calendar month */
  naturalMinutes: number
  /** Minutes of newly made Expressive-voice audio per month, or once if `expressiveTrial` */
  expressiveMinutes: number
  /** The Expressive minutes are a one-time trial, not monthly (Free) */
  expressiveTrial?: boolean
  /** Characters "Translate" can turn into another language per month */
  translateChars: number
}

export interface PlanDefinition {
  id: PlanId
  name: string
  /** Shown until store prices load; real prices are set per country in Play Console */
  price: string | null
  allowances: Record<AllowanceRegion, Allowance>
  /** Pages read with OCR (scans, photos, legacy-font PDFs) per month; null for no cap */
  monthlyOcrPages: number | null
  /** Daily digests per month; null for no cap */
  monthlyDigests: number | null
  perks: string[]
}

/**
 * Plans and their limits, sized so a typical subscriber leaves a healthy margin
 * at 2027 voice prices (see the business plan). Natural voices cost about
 * $0.03 an hour and Expressive about $1.16, so Expressive is what's rationed.
 */
export const PLANS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    price: null,
    // 5 Expressive minutes, once: 15 cost more per new user (~$0.29 in 2027) than paying users bring in
    allowances: {
      standard: { naturalMinutes: 60, expressiveMinutes: 5, expressiveTrial: true, translateChars: 30_000 },
      reduced: { naturalMinutes: 60, expressiveMinutes: 5, expressiveTrial: true, translateChars: 30_000 },
    },
    // OCR is ~$0.0004 a page and a digest ~$0.005; uncapped, a free user could cost more than ads bring in
    monthlyOcrPages: 200,
    monthlyDigests: 8,
    perks: ['PDFs, articles, photos and notes', 'Try Expressive voices with emotions'],
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '$3.99 a month',
    allowances: {
      standard: { naturalMinutes: 40 * 60, expressiveMinutes: 90, translateChars: 1_000_000 },
      // Translation costs ~$0.95 per million characters: 1M on ৳149 would cost more than the plan brings in
      reduced: { naturalMinutes: 20 * 60, expressiveMinutes: 30, translateChars: 250_000 },
    },
    monthlyOcrPages: null,
    monthlyDigests: null,
    perks: ['Listen offline, or save as MP3', 'Your documents in any podcast app', 'Summaries and quizzes for any document', 'Room for whole books'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$8.99 a month',
    allowances: {
      standard: { naturalMinutes: 60 * 60, expressiveMinutes: 4 * 60, translateChars: 3_000_000 },
      reduced: { naturalMinutes: 40 * 60, expressiveMinutes: 90, translateChars: 750_000 },
    },
    monthlyOcrPages: null,
    monthlyDigests: null,
    perks: ['Everything in Plus', 'For daily, heavy listening'],
  },
]

/**
 * RevenueCat entitlements that grant each paid plan, best first. Attach the Play
 * subscription "plus" (base plans monthly and yearly) to the "plus" entitlement,
 * and "pro" to "pro". See BILLING.md.
 */
export const PLAN_ENTITLEMENTS: { entitlement: string; plan: PlanId }[] = [
  { entitlement: 'pro', plan: 'pro' },
  { entitlement: 'plus', plan: 'plus' },
]

/** The plan that includes a voice cloned from the listener's own recording */
export const OWN_VOICE_PLAN: PlanId = 'pro'

/** Studio packs (Google Play one-time products): Expressive minutes that never expire */
export const STUDIO_PACKS: Record<string, number> = { studio_30: 30, studio_120: 120 }

/** Store countries with lower Play prices, where paid plans carry reduced allowances */
export const REDUCED_ALLOWANCE_COUNTRIES = new Set(['BD', 'IN', 'PK', 'NP', 'LK', 'ID', 'PH', 'VN', 'NG', 'EG', 'KE'])

const byId = new Map(PLANS.map((p) => [p.id, p]))
const RANK: Record<PlanId, number> = { free: 0, plus: 1, pro: 2 }

/** A user's plan; unknown ids (e.g. a removed plan) fall back to Free */
export const planFor = (id: string | null | undefined) => byId.get(id as PlanId) ?? PLANS[0]

/** Whether a user's plan includes features of `min` and up */
export const planAtLeast = (id: string | null | undefined, min: PlanId) => RANK[planFor(id).id] >= RANK[min]

export const regionFor = (country: string | null | undefined): AllowanceRegion =>
  country && REDUCED_ALLOWANCE_COUNTRIES.has(country.toUpperCase()) ? 'reduced' : 'standard'

/** Phone time zones of the reduced-price countries (including old names some phones still report) */
const REDUCED_TIME_ZONES = new Set([
  'Asia/Dhaka', 'Asia/Dacca', // BD
  'Asia/Kolkata', 'Asia/Calcutta', // IN
  'Asia/Karachi', // PK
  'Asia/Kathmandu', 'Asia/Katmandu', // NP
  'Asia/Colombo', // LK
  'Asia/Jakarta', 'Asia/Pontianak', 'Asia/Makassar', 'Asia/Ujung_Pandang', 'Asia/Jayapura', // ID
  'Asia/Manila', // PH
  'Asia/Ho_Chi_Minh', 'Asia/Saigon', // VN
  'Africa/Lagos', // NG
  'Africa/Cairo', 'Egypt', // EG
  'Africa/Nairobi', // KE
])

/**
 * The region for rewards (ads, invites): the store country when there is one,
 * otherwise the phone's time zone, since Free users have no store country.
 * Unknown means standard. Plan allowances follow the store country only.
 */
export const rewardRegionFor = (country: string | null | undefined, timeZone: string | null | undefined): AllowanceRegion =>
  country ? regionFor(country) : timeZone && REDUCED_TIME_ZONES.has(timeZone) ? 'reduced' : 'standard'

/** The allowance a user gets: their plan, in their store's region */
export const allowanceFor = (plan: string | null | undefined, country: string | null | undefined) => planFor(plan).allowances[regionFor(country)]

/** Monthly (or trial) minutes for one voice level */
export const minutesFor = (allowance: Allowance, tier: ServerTier) => (tier === 'natural' ? allowance.naturalMinutes : allowance.expressiveMinutes)
