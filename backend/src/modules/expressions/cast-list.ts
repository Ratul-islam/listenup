import type { DocumentChunk } from '../../generated/prisma/client.js'
import { castVoice, isChosen } from '../voices/cast.js'
import type { VoiceDefinition } from '../voices/voice-catalog.js'
import { readCast } from './auto-expression.js'
import { readExpressions } from './expression-catalog.js'

/**
 * The story's characters who have lines, with the voice each reads in beside
 * the document's current narrator: what the Cast sheet shows.
 */
export function castList(brief: unknown, chunks: Pick<DocumentChunk, 'expressions' | 'language'>[], narratorOf: (language: string) => VoiceDefinition) {
  const lines = new Map<string, { count: number; language: string }>()
  for (const chunk of chunks) {
    for (const mark of readExpressions(chunk.expressions).speakers) {
      const seen = lines.get(mark.name) ?? { count: 0, language: chunk.language }
      seen.count++
      lines.set(mark.name, seen)
    }
  }
  return readCast(brief)
    .filter((c) => lines.has(c.name))
    .map((c) => {
      const { count, language } = lines.get(c.name)!
      const narrator = narratorOf(language)
      const voice = castVoice(c, narrator)
      return {
        name: c.name,
        /** How the story describes them, in a few words */
        description: c.voice,
        gender: c.gender ?? null,
        lines: count,
        voiceId: voice.id,
        /** The listener picked this voice; otherwise it was cast automatically */
        chosen: isChosen(c, narrator),
        /** False when there's no other voice to give them, so the narrator reads their lines */
        ownVoice: voice.providerVoice !== narrator.providerVoice,
        /** The narrator they're cast beside: their voice comes from its language and level */
        narratorId: narrator.id,
      }
    })
}
