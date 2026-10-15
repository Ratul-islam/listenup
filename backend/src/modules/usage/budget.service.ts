import { env } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'
import type { UsageRepository } from './usage.repository.js'

export type SpendBucket = 'free' | 'paid'

// Totals are re-read this often so several processes stay roughly in step
const REFRESH_MS = 30_000
// Free accounts whose spending today is kept in memory; past this the list starts again
const MAX_USERS_HELD = 20_000

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Daily spending caps, for speech and text AI together. Free users share one
 * small budget and everyone shares a larger one; once either is spent, new
 * audio and AI features pause until midnight UTC (cached audio still plays).
 * Each Free account also has its own small share of the Free budget, so one
 * account (looping an AI feature, say) can't pause it for every Free user.
 * Totals are estimates from config/voice-pricing, or OpenRouter's own figure
 * for text. Keep one instance per process so the in-memory totals are shared.
 */
export class BudgetService {
  private totals = { day: '', free: 0, paid: 0, loadedAt: 0 }
  private users = new Map<string, { day: string; usd: number; loadedAt: number }>()

  constructor(private readonly usageRepository: UsageRepository) {}

  private async current() {
    const day = today()
    if (this.totals.day !== day || Date.now() - this.totals.loadedAt > REFRESH_MS) {
      const rows = await this.usageRepository.spendOn(day)
      const sum = (bucket: SpendBucket) => rows.filter((r) => r.bucket === bucket).reduce((n, r) => n + r.costMicros, 0) / 1e6
      this.totals = { day, free: sum('free'), paid: sum('paid'), loadedAt: Date.now() }
    }
    return this.totals
  }

  /** What a Free account has spent today, re-read now and then like the totals */
  private async userToday(userId: string) {
    const day = today()
    let entry = this.users.get(userId)
    if (!entry || entry.day !== day || Date.now() - entry.loadedAt > REFRESH_MS) {
      if (this.users.size >= MAX_USERS_HELD) this.users.clear()
      entry = { day, usd: (await this.usageRepository.userSpendOn(userId, day)) / 1e6, loadedAt: Date.now() }
      this.users.set(userId, entry)
    }
    return entry
  }

  /**
   * `kind` only changes the message: speech pauses new audio, text pauses AI features (OCR, translation, digests…).
   * `userId`, for a Free account's own share; requests the app makes for itself have none.
   */
  async assertCanSpend(bucket: SpendBucket, estimateUsd: number, kind: 'speech' | 'text' = 'speech', userId?: string | null) {
    if (bucket === 'free' && userId && (await this.userToday(userId)).usd + estimateUsd > env.FREE_USER_DAILY_SPEND_USD) {
      throw new AppError(
        kind === 'text'
          ? 'You’ve used today’s free AI. It comes back at midnight (UTC), or upgrade for more.'
          : 'You’ve used today’s free voices. Switch to a phone voice, or try again after midnight (UTC).',
        402,
        'BUDGET_PAUSED',
      )
    }
    const t = await this.current()
    const overall = t.free + t.paid + estimateUsd > env.DAILY_SPEND_CAP_USD
    const free = bucket === 'free' && t.free + estimateUsd > env.FREE_DAILY_SPEND_CAP_USD
    if (overall || free) {
      if (overall) console.warn(`[budget] daily cap of $${env.DAILY_SPEND_CAP_USD} reached`)
      const message =
        kind === 'text'
          ? bucket === 'free'
            ? 'Free AI features are busy for today. Try again tomorrow.'
            : 'This is paused for a little while. Try again later.'
          : bucket === 'free'
            ? 'Free voices are busy for today. Switch to another voice, or try again tomorrow.'
            : 'New audio is paused for a little while. Try again later.'
      throw new AppError(message, 402, 'BUDGET_PAUSED')
    }
  }

  /** `characters` is input characters for speech, prompt tokens for text */
  async record(bucket: SpendBucket, model: string, seconds: number, characters: number, usd: number, userId?: string | null) {
    const t = await this.current()
    t[bucket] += usd
    if (bucket === 'free' && userId) {
      const mine = await this.userToday(userId)
      mine.usd += usd
      await this.usageRepository.addUserSpend(userId, t.day, Math.round(usd * 1e6))
    }
    await this.usageRepository.addSpend(t.day, bucket, model, {
      seconds: Math.round(seconds),
      characters,
      costMicros: Math.round(usd * 1e6),
    })
  }
}
