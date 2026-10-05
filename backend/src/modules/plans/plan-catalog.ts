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
}

export interface PlanDefinition {
  id: PlanId
  name: string
  /** Shown until store prices load; real prices are set per country in Play Console */
  price: string | null
  allowances: Record<AllowanceRegion, Allowance>
  /** Characters "Translate" can turn into another language per month */
  monthlyTranslateChars: number
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
    allowances: {
      standard: { naturalMinutes: 60, expressiveMinutes: 15, expressiveTrial: true },
      reduced: { naturalMinutes: 60, expressiveMinutes: 15, expressiveTrial: true },
    },
    monthlyTranslateChars: 30_000,
    perks: ['PDFs, articles, photos and notes', 'Try Expressive voices with emotions'],
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '$3.99 a month',
    allowances: {
      standard: { naturalMinutes: 40 * 60, expressiveMinutes: 90 },
      reduced: { naturalMinutes: 20 * 60, expressiveMinutes: 30 },
    },
    monthlyTranslateChars: 1_000_000,
    perks: ['Listen offline, or save as MP3', 'Your documents in any podcast app', 'Summaries and quizzes for any document', 'Room for whole books'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$8.99 a month',
    allowances: {
      standard: { naturalMinutes: 60 * 60, expressiveMinutes: 4 * 60 },
      reduced: { naturalMinutes: 40 * 60, expressiveMinutes: 90 },
    },
    monthlyTranslateChars: 3_000_000,
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

/** The allowance a user gets: their plan, in their store's region */
export const allowanceFor = (plan: string | null | undefined, country: string | null | undefined) => planFor(plan).allowances[regionFor(country)]

/** Monthly (or trial) minutes for one voice level */
export const minutesFor = (allowance: Allowance, tier: ServerTier) => (tier === 'natural' ? allowance.naturalMinutes : allowance.expressiveMinutes)
