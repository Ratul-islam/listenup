import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

const BASE_URL = 'https://api.revenuecat.com/v1'

export interface RcEntitlement {
  expires_date: string | null
  grace_period_expires_date: string | null
  product_identifier: string
  purchase_date: string
}

export interface RcSubscription {
  expires_date: string | null
  unsubscribe_detected_at: string | null
  billing_issues_detected_at: string | null
  is_sandbox: boolean
  store: string
}

export interface RcNonSubscription {
  id: string
  store_transaction_id?: string
  purchase_date: string
  is_sandbox: boolean
}

export interface RcSubscriber {
  entitlements: Record<string, RcEntitlement>
  subscriptions: Record<string, RcSubscription>
  non_subscriptions: Record<string, RcNonSubscription[]>
  management_url: string | null
}

export const billingConfigured = () => !!env.REVENUECAT_SECRET_KEY

/** A customer's current purchases (RevenueCat creates the customer if it's new) */
export async function getSubscriber(appUserId: string): Promise<RcSubscriber> {
  if (!env.REVENUECAT_SECRET_KEY) throw new AppError('Purchases are not set up yet', 503, 'BILLING_NOT_CONFIGURED')
  const res = await fetch(`${BASE_URL}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${env.REVENUECAT_SECRET_KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[revenuecat] subscriber lookup failed (${res.status}): ${body.slice(0, 300)}`)
    throw new AppError("Couldn't check your purchases right now. Try again shortly.", 502, 'BILLING_UNAVAILABLE')
  }
  const { subscriber } = (await res.json()) as { subscriber: Partial<RcSubscriber> }
  return {
    entitlements: subscriber.entitlements ?? {},
    subscriptions: subscriber.subscriptions ?? {},
    non_subscriptions: subscriber.non_subscriptions ?? {},
    management_url: subscriber.management_url ?? null,
  }
}
