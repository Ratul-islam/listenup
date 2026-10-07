import { prisma } from '../../config/db.js'
import { buildLexicon, type Lexicon } from './lexicon.js'
import { PronunciationsRepository } from './pronunciations.repository.js'

// The API and the workers run in one process, and edits clear the entry at once;
// the time limit only matters when they run apart
const TTL_MS = 30_000
const MAX_ENTRIES = 2000

const repository = new PronunciationsRepository(prisma)
const cache = new Map<string, { at: number; lexicon: Promise<Lexicon> }>()

/**
 * A user's pronunciations, ready to apply. Every place that voices or keys a
 * document's audio uses the owner's lexicon from here, so they always agree.
 */
export function lexiconFor(userId: string): Promise<Lexicon> {
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.lexicon
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  const lexicon = repository.rules(userId).then(buildLexicon)
  lexicon.catch(() => cache.delete(userId))
  cache.set(userId, { at: Date.now(), lexicon })
  return lexicon
}

export const forgetLexicon = (userId: string) => void cache.delete(userId)
