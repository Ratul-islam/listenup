import { promptTokensOf, textCostUsd, withOpenRouterFee } from '../../config/voice-pricing.js'
import type { ChatRequest, TextSpendGuard } from '../../lib/openrouter.js'
import { planFor } from '../plans/plan-catalog.js'
import type { BudgetService, SpendBucket } from './budget.service.js'
import type { UsageRepository } from './usage.repository.js'

// Output assumed for the estimate before a request (replies are usually shorter)
const ESTIMATED_OUTPUT_TOKENS = 2000

/**
 * Text AI (OCR, translation, digests, summaries, "Make it expressive", the
 * community check) inside the same daily caps as speech: a request is refused
 * once today's cap for its user's bucket is spent, and what it cost is recorded
 * per model. The app's own requests (no user) count only toward the overall cap.
 */
export function textSpendGuard(budget: BudgetService, usageRepository: UsageRepository): TextSpendGuard {
  const bucketOf = async (userId: string | null | undefined): Promise<SpendBucket> => {
    if (!userId) return 'paid'
    return planFor((await usageRepository.findUser(userId))?.plan).id === 'free' ? 'free' : 'paid'
  }
  return {
    async before(req: ChatRequest) {
      const bucket = await bucketOf(req.userId)
      const textChars = req.content.reduce((n, p) => n + (p.type === 'text' ? p.text.length : 0), (req.system ?? '').length)
      const attachments = req.content.filter((p) => p.type !== 'text').length
      const output = Math.min(req.maxTokens ?? ESTIMATED_OUTPUT_TOKENS, ESTIMATED_OUTPUT_TOKENS)
      await budget.assertCanSpend(bucket, textCostUsd(req.model, promptTokensOf(textChars, attachments), output), 'text', req.userId)
      return bucket
    },
    async after(req, usage, bucket) {
      const usd = usage.costUsd !== null ? withOpenRouterFee(usage.costUsd) : textCostUsd(req.model, usage.promptTokens, usage.completionTokens)
      await budget.record(bucket as SpendBucket, req.model, 0, usage.promptTokens, usd, req.userId)
    },
  }
}
