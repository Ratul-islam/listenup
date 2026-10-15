import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'

// Every own-voice id starts with this ("mine-bn")
const OWN_CLIPS = { voiceId: { startsWith: 'mine-' } }

export class OwnVoiceRepository {
  constructor(private readonly db: PrismaClient) {}

  /** The listener's plan and place, their name, and the voice they've made (if any) */
  findOwner(userId: string) {
    return this.db.user.findUnique({ where: { id: userId }, select: { name: true, plan: true, billingCountry: true, timeZone: true, ownVoice: true } })
  }

  find(userId: string) {
    return this.db.ownVoice.findUnique({ where: { userId } })
  }

  /** Voices held at Google now, which keeps a limited number */
  countStored() {
    return this.db.ownVoice.count({ where: { providerVoiceId: { not: null } } })
  }

  upsert(userId: string, create: Omit<Prisma.OwnVoiceUncheckedCreateInput, 'userId'>, update: Prisma.OwnVoiceUncheckedUpdateInput) {
    return this.db.ownVoice.upsert({ where: { userId }, create: { userId, ...create }, update })
  }

  update(userId: string, data: Prisma.OwnVoiceUncheckedUpdateInput) {
    return this.db.ownVoice.update({ where: { userId }, data })
  }

  /** Empties the row of the voice and its recordings. The month's count of tries stays, so deleting isn't a way round the limit. */
  clear(userId: string) {
    return this.db.ownVoice.updateMany({
      where: { userId },
      data: { name: '', providerVoiceId: null, consentLanguage: null, consentedAt: null, sourceKey: null, consentKey: null, providerCreatedAt: null },
    })
  }

  /** Voices made at Google before `before`, due to be made again */
  findMadeBefore(before: Date, take: number) {
    return this.db.ownVoice.findMany({ where: { providerVoiceId: { not: null }, providerCreatedAt: { lt: before } }, orderBy: { providerCreatedAt: 'asc' }, take })
  }

  /**
   * Clips in an own voice whose listener has no voice any more: ones that were
   * still being made while the voice was deleted
   */
  forgetStrayAudio() {
    return this.db.audioClip.deleteMany({
      where: { ...OWN_CLIPS, chunk: { document: { user: { OR: [{ ownVoice: { is: null } }, { ownVoice: { is: { providerVoiceId: null } } }] } } } },
    })
  }

  /** The listener's documents with audio in their own voice */
  async documentsVoiced(userId: string) {
    const clips = await this.db.audioClip.findMany({ where: { ...OWN_CLIPS, chunk: { document: { userId } } }, select: { chunk: { select: { documentId: true } } }, distinct: ['chunkId'] })
    return [...new Set(clips.map((c) => c.chunk.documentId))]
  }

  /**
   * Forgets everything made in the listener's own voice: its clips (their
   * files go with the daily cleanup of unused audio), and the MP3s and offline
   * downloads of the documents that had them, which are made again when asked for.
   */
  forgetAudio(userId: string, documentIds: string[]) {
    return this.db.$transaction([
      this.db.audioClip.deleteMany({ where: { ...OWN_CLIPS, chunk: { document: { userId } } } }),
      this.db.audioExport.deleteMany({ where: { documentId: { in: documentIds } } }),
      this.db.offlineDownload.deleteMany({ where: { documentId: { in: documentIds } } }),
    ])
  }
}
