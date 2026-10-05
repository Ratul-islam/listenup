import { env } from '../../config/env.js'
import { AppError } from '../../utils/AppError.js'
import type { UsageRepository } from './usage.repository.js'

export type SpendBucket = 'free' | 'paid'

// Totals are re-read this often so several processes stay roughly in step
const REFRESH_MS = 30_000

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Daily speech spending caps. Free users share one small budget and everyone
 * shares a larger one; once either is spent, new audio pauses until midnight
 * UTC (cached audio still plays). Totals are estimates from config/voice-pricing.
 * Keep one instance per process so the in-memory totals are shared.
 */
export class BudgetService {
  private totals = { day: '', free: 0, paid: 0, loadedAt: 0 }

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

  async assertCanSpend(bucket: SpendBucket, estimateUsd: number) {
    const t = await this.current()
    const overall = t.free + t.paid + estimateUsd > env.DAILY_SPEND_CAP_USD
    const free = bucket === 'free' && t.free + estimateUsd > env.FREE_DAILY_SPEND_CAP_USD
    if (overall || free) {
      if (overall) console.warn(`[budget] daily cap of $${env.DAILY_SPEND_CAP_USD} reached`)
      throw new AppError(
        bucket === 'free'
          ? 'Free voices are busy for today. Switch to another voice, or try again tomorrow.'
          : 'New audio is paused for a little while. Try again later.',
        402,
        'BUDGET_PAUSED',
      )
    }
  }

  async record(bucket: SpendBucket, model: string, seconds: number, characters: number, usd: number) {
    const t = await this.current()
    t[bucket] += usd
    await this.usageRepository.addSpend(t.day, bucket, model, {
      seconds: Math.round(seconds),
      characters,
      costMicros: Math.round(usd * 1e6),
    })
  }
}
