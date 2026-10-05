import { createHash, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env.js'
import { billingConfigured, getSubscriber, type RcEntitlement, type RcSubscriber } from '../../lib/revenuecat.js'
import { AppError } from '../../utils/AppError.js'
import { PLAN_ENTITLEMENTS, STUDIO_PACKS, type PlanId } from '../plans/plan-catalog.js'
import type { BillingRepository } from './billing.repository.js'
import type { WebhookBody } from './billing.schema.js'

// A lapsed plan gets this long for a late renewal to arrive before it drops to Free
const LAPSE_GRACE_MS = 24 * 60 * 60_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const digest = (value: string) => createHash('sha256').update(value).digest()

const isActive = (e: RcEntitlement, now: number) =>
  !e.expires_date || Date.parse(e.expires_date) > now || (!!e.grace_period_expires_date && Date.parse(e.grace_period_expires_date) > now)

/**
 * Google Play purchases through RevenueCat. RevenueCat is the source of truth:
 * every webhook (and the app, right after a purchase) triggers a sync that reads
 * the customer's current entitlements and Studio packs, so events arriving late
 * or out of order can't leave a wrong plan. The app identifies customers by our user id.
 */
export class BillingService {
  constructor(private readonly billingRepository: BillingRepository) {}

  /** RevenueCat sends the Authorization value configured on the webhook (with or without "Bearer ") */
  private assertWebhookAuth(header: string | undefined) {
    const secret = env.REVENUECAT_WEBHOOK_SECRET
    if (!secret) throw new AppError('Purchases are not set up yet', 503, 'BILLING_NOT_CONFIGURED')
    const given = (header ?? '').replace(/^Bearer\s+/i, '')
    if (!timingSafeEqual(digest(given), digest(secret))) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  async handleWebhook(authorization: string | undefined, body: WebhookBody) {
    this.assertWebhookAuth(authorization)
    const event = body.event
    if (event.type === 'TEST') return { synced: 0 }

    const ids = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? []), ...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
    const candidates = [...new Set(ids.filter((id): id is string => !!id && UUID.test(id)))]
    const users = candidates.length ? await this.billingRepository.findUsers(candidates) : []

    for (const user of users) {
      if (event.country_code && event.type !== 'TRANSFER') await this.billingRepository.setCountry(user.id, event.country_code.toUpperCase())
      await this.sync(user.id)
    }
    return { synced: users.length }
  }

  /** Reads the customer's purchases from RevenueCat and applies them: plan, period end, Studio packs */
  async sync(userId: string) {
    const subscriber = await getSubscriber(userId)
    const { plan, expiresAt, renews } = this.planOf(subscriber)

    for (const [productId, purchases] of Object.entries(subscriber.non_subscriptions)) {
      const minutes = STUDIO_PACKS[productId]
      if (!minutes) continue
      for (const p of purchases) await this.billingRepository.creditPack(userId, p.id, productId, minutes * 60, p.is_sandbox)
    }

    const user = await this.billingRepository.setPlan(userId, plan, expiresAt, renews)
    return { ...user, managementUrl: subscriber.management_url }
  }

  private planOf(subscriber: RcSubscriber): { plan: PlanId; expiresAt: Date | null; renews: boolean } {
    const now = Date.now()
    for (const { entitlement, plan } of PLAN_ENTITLEMENTS) {
      const e = subscriber.entitlements[entitlement]
      if (!e || !isActive(e, now)) continue
      const sub = subscriber.subscriptions[e.product_identifier]
      const renews = !!sub && !sub.unsubscribe_detected_at
      return { plan, expiresAt: e.expires_date ? new Date(e.expires_date) : null, renews }
    }
    return { plan: 'free', expiresAt: null, renews: false }
  }

  /**
   * Hourly safety net for missed webhooks: plans whose period ended over a day
   * ago are re-checked with RevenueCat, or dropped to Free if it isn't set up.
   */
  async expireLapsedPlans() {
    const lapsed = await this.billingRepository.lapsedPaidUsers(new Date(Date.now() - LAPSE_GRACE_MS))
    for (const { id } of lapsed) {
      try {
        if (billingConfigured()) await this.sync(id)
        else await this.billingRepository.setPlan(id, 'free', null, false)
      } catch (e) {
        console.error(`[billing] couldn't re-check lapsed plan for ${id}`, e)
      }
    }
    return lapsed.length
  }
}
