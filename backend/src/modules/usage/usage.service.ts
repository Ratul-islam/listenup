import { speechCostUsd } from '../../config/voice-pricing.js'
import { AppError } from '../../utils/AppError.js'
import { planFor, regionFor } from '../plans/plan-catalog.js'
import type { ServerTier, VoiceDefinition } from '../voices/voice-catalog.js'
import type { BudgetService, SpendBucket } from './budget.service.js'
import type { UsageRepository } from './usage.repository.js'

const currentPeriod = () => new Date().toISOString().slice(0, 7)

/** First day of next month, when monthly allowances reset ("YYYY-MM-DD") */
const resetDate = () => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
}

const LIMIT_MESSAGES = {
  natural: "You've used this month's Natural-voice minutes. They reset on the 1st.",
  expressive: "You've used this month's Expressive minutes. Pick a Natural voice, or upgrade for more.",
  trial: 'Your free Expressive minutes are used up. Natural voices still work, or upgrade for more.',
} as const

const limitReached = (kind: keyof typeof LIMIT_MESSAGES) => new AppError(LIMIT_MESSAGES[kind], 402, 'USAGE_LIMIT_REACHED')

/**
 * Speech allowances from the user's plan, in seconds of newly made audio per
 * voice level. Natural minutes are monthly. Expressive minutes are monthly on
 * paid plans and a one-time trial on Free; Studio-pack minutes are spent after
 * either runs out. Every new clip also counts toward the daily spending caps.
 */
export class UsageService {
  constructor(
    private readonly usageRepository: UsageRepository,
    private readonly budget: BudgetService,
  ) {}

  async summary(userId: string) {
    const period = currentPeriod()
    const [month, user] = await Promise.all([this.usageRepository.find(userId, period), this.usageRepository.findUser(userId)])
    const plan = planFor(user?.plan)
    const region = regionFor(user?.billingCountry)
    const allowance = plan.allowances[region]
    const trial = !!allowance.expressiveTrial
    const bonusSec = user?.bonusExpressiveSec ?? 0

    const naturalUsed = month?.naturalSec ?? 0
    // Rewarded ads add Natural seconds to this month only
    const naturalBonusSec = month?.bonusNaturalSec ?? 0
    const naturalLimit = allowance.naturalMinutes * 60 + naturalBonusSec
    const expressiveUsed = trial ? (user?.expressiveTrialUsedSec ?? 0) : (month?.expressiveSec ?? 0)
    const expressiveLimit = allowance.expressiveMinutes * 60
    const translatedUsed = month?.translatedChars ?? 0

    return {
      period,
      resetsOn: resetDate(),
      plan: {
        id: plan.id,
        name: plan.name,
        /** When the paid period ends, and whether it renews then */
        expiresAt: user?.planExpiresAt?.toISOString() ?? null,
        renews: user?.planRenews ?? false,
      },
      region,
      natural: { usedSec: naturalUsed, limitSec: naturalLimit, remainingSec: Math.max(naturalLimit - naturalUsed, 0), bonusSec: naturalBonusSec },
      expressive: {
        usedSec: expressiveUsed,
        limitSec: expressiveLimit,
        remainingSec: Math.max(expressiveLimit - expressiveUsed, 0) + bonusSec,
        bonusSec,
        /** The Expressive minutes are a one-time trial (Free) */
        trial,
      },
      translation: {
        usedChars: translatedUsed,
        limitChars: plan.monthlyTranslateChars,
        remainingChars: Math.max(plan.monthlyTranslateChars - translatedUsed, 0),
      },
    }
  }

  private bucket(planId: string): SpendBucket {
    return planId === 'free' ? 'free' : 'paid'
  }

  /**
   * Before voicing a clip: some allowance must be left for its voice level (the
   * last clip may run slightly over) and the daily spending cap must allow it.
   */
  async assertAvailable(userId: string, voice: VoiceDefinition & { tier: ServerTier }, estimatedSec: number, characters: number) {
    const s = await this.summary(userId)
    if (s[voice.tier].remainingSec <= 0) throw limitReached(voice.tier === 'expressive' && s.expressive.trial ? 'trial' : voice.tier)
    await this.budget.assertCanSpend(this.bucket(s.plan.id), speechCostUsd(voice.model, characters, estimatedSec))
  }

  /** Before voicing many clips at once (MP3 export): the allowance must cover all of them */
  async assertCovers(userId: string, neededSec: Record<ServerTier, number>) {
    const s = await this.summary(userId)
    for (const tier of ['natural', 'expressive'] as const) {
      if (neededSec[tier] > s[tier].remainingSec) {
        throw new AppError(
          "There isn't enough listening time left this month to voice the rest of this document. It resets on the 1st.",
          402,
          'USAGE_LIMIT_REACHED',
        )
      }
    }
  }

  /** Before translating a document: this month's translation allowance must cover it */
  async assertCanTranslate(userId: string, characters: number) {
    const { translation } = await this.summary(userId)
    if (characters > translation.remainingChars) {
      throw new AppError(
        translation.remainingChars > 0
          ? "This document is longer than this month's translation allowance. Upgrade for more, or try a shorter one."
          : "You've used this month's translations. They reset on the 1st.",
        402,
        'TRANSLATION_LIMIT_REACHED',
      )
    }
  }

  async recordTranslation(userId: string, characters: number) {
    await this.usageRepository.add(userId, currentPeriod(), { characters: 0, naturalSec: 0, expressiveSec: 0, translatedChars: characters })
  }

  /** After a clip is made: counts its real length and its estimated cost */
  async record(userId: string, voice: VoiceDefinition & { tier: ServerTier }, seconds: number, characters: number) {
    const s = await this.summary(userId)
    const sec = Math.round(seconds)
    const expressive = voice.tier === 'expressive'

    await this.usageRepository.add(userId, s.period, {
      characters,
      naturalSec: expressive ? 0 : sec,
      expressiveSec: expressive ? sec : 0,
    })
    if (expressive) {
      if (s.expressive.trial) await this.usageRepository.addTrial(userId, sec)
      // Whatever this clip takes beyond the plan's minutes comes out of Studio-pack minutes
      const { usedSec, limitSec, bonusSec } = s.expressive
      const overflow = Math.max(usedSec + sec - limitSec, 0) - Math.max(usedSec - limitSec, 0)
      if (overflow > 0 && bonusSec > 0) await this.usageRepository.spendBonus(userId, overflow)
    }
    await this.budget.record(this.bucket(s.plan.id), voice.model, seconds, characters, speechCostUsd(voice.model, characters, seconds))
  }
}
