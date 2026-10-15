import { prisma } from '../../config/db.js'
import { ttsProviderName } from '../../config/env.js'
import type { SpeakerVoice } from '../../generated/prisma/client.js'
import { createReplicatedVoice } from '../../lib/gemini.js'
import { storage } from '../../lib/storage/storage.js'
import type { SpeakerVoiceRef } from '../voices/speaker-voice.js'

// Google keeps a stateless voice key 7 days; it's made again from the kept recordings a day before
const RENEW_AFTER_MS = 6 * 24 * 60 * 60_000
const mockCloning = ttsProviderName === 'mock'

/** Renewals under way, so a key is made again once however many requests need it at once */
const renewing = new Map<string, Promise<SpeakerVoice | null>>()

/** A new key for a speaker's voice from the two recordings it was made from; null if it can't be made now */
function renew(voice: SpeakerVoice): Promise<SpeakerVoice | null> {
  let pending = renewing.get(voice.id)
  if (!pending) {
    pending = (async () => {
      if (!voice.sourceKey || !voice.consentKey) return null
      try {
        const [sourceWav, consentWav] = await Promise.all([storage.get(voice.sourceKey), storage.get(voice.consentKey)])
        const key = await createReplicatedVoice({ model: voice.model, displayName: `listenup-speaker-${voice.id}`, sourceWav, consentWav, store: false })
        return await prisma.speakerVoice.update({ where: { id: voice.id }, data: { providerVoiceId: key, providerCreatedAt: new Date() } })
      } catch (e) {
        console.error(`[speaker-voice] couldn't renew ${voice.id}`, e)
        return null
      }
    })().finally(() => renewing.delete(voice.id))
    renewing.set(voice.id, pending)
  }
  return pending
}

/**
 * The listener's speaker voices ready to speak: any whose key is about to lapse is made again
 * first (a few seconds, once a week at most). One that can't be renewed is left out, and its
 * translation falls back to the listener's usual voice until it can.
 */
export async function freshSpeakerVoices(voices: (SpeakerVoice & { document: { title: string } })[]): Promise<SpeakerVoiceRef[]> {
  const ready = await Promise.all(
    voices.map(async (voice) => {
      if (!voice.providerVoiceId) return null
      const stale = !mockCloning && (!voice.providerCreatedAt || Date.now() - voice.providerCreatedAt.getTime() > RENEW_AFTER_MS)
      const current = stale ? await renew(voice) : voice
      return current?.providerVoiceId
        ? { id: current.id, documentId: current.documentId, model: current.model, providerVoiceId: current.providerVoiceId, version: current.version, title: voice.document.title }
        : null
    }),
  )
  return ready.filter((v): v is SpeakerVoiceRef => !!v)
}
