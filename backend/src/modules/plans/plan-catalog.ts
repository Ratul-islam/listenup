import { CHARS_PER_SECOND } from '../../config/constants.js'
import { env } from '../../config/env.js'

export type PlanId = 'free' | 'plus' | 'pro'

export interface PlanDefinition {
  id: PlanId
  name: string
  /** Characters of speech that can be generated per calendar month */
  monthlyChars: number
  /** Shown as-is; null for the free plan */
  price: string | null
  perks: string[]
  /** False until Play Billing is wired up; the app shows "Available soon" */
  purchasable: boolean
}

/**
 * Plans and their limits. PLACEHOLDER prices: set real ones (and turn on
 * `purchasable`) when Play Billing is added.
 */
export const PLANS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyChars: env.FREE_TIER_MONTHLY_CHARS,
    price: null,
    perks: ['Every voice, with emotions', 'PDFs, articles, photos and notes'],
    purchasable: false,
  },
  {
    id: 'plus',
    name: 'Plus',
    monthlyChars: 1_500_000,
    price: '৳299 a month',
    perks: ['Everything in Free', 'Download anything as an MP3', 'Room for whole books'],
    purchasable: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyChars: 5_000_000,
    price: '৳799 a month',
    perks: ['Everything in Plus', 'For daily, heavy listening'],
    purchasable: false,
  },
]

const byId = new Map(PLANS.map((p) => [p.id, p]))
const RANK: Record<PlanId, number> = { free: 0, plus: 1, pro: 2 }

/** A user's plan; unknown ids (e.g. a removed plan) fall back to Free */
export const planFor = (id: string | null | undefined) => byId.get(id as PlanId) ?? PLANS[0]

/** Whether a user's plan includes features of `min` and up */
export const planAtLeast = (id: string | null | undefined, min: PlanId) => RANK[planFor(id).id] >= RANK[min]

/** Approximate listening time a character allowance buys, at 1× */
export const listeningHours = (chars: number) => Math.round(chars / CHARS_PER_SECOND.en / 3600)
