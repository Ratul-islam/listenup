import { Prisma, type PrismaClient } from '../../generated/prisma/client.js'

export class VoiceTranslationRepository {
  constructor(private readonly db: PrismaClient) {}

  findOwner(userId: string) {
    return this.db.user.findUnique({ where: { id: userId }, select: { plan: true, billingCountry: true, timeZone: true } })
  }

  /** Voice translations started this calendar month (UTC) */
  countThisMonth(userId: string) {
    const now = new Date()
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    return this.db.document.count({ where: { userId, createdAt: { gte: start }, studio: { path: ['translation', 'to'], string_contains: '' } } })
  }

  createDocument(data: Prisma.DocumentUncheckedCreateInput) {
    return this.db.document.create({ data })
  }

  findDocument(id: string) {
    return this.db.document.findUnique({ where: { id }, include: { speakerVoice: true } })
  }

  findOwnedDocument(userId: string, id: string) {
    return this.db.document.findFirst({ where: { id, userId }, include: { speakerVoice: true } })
  }

  updateDocument(id: string, data: Prisma.DocumentUncheckedUpdateInput) {
    return this.db.document.update({ where: { id }, data })
  }

  upsertSpeakerVoice(documentId: string, create: Omit<Prisma.SpeakerVoiceUncheckedCreateInput, 'documentId'>, update: Prisma.SpeakerVoiceUncheckedUpdateInput) {
    return this.db.speakerVoice.upsert({ where: { documentId }, create: { documentId, ...create }, update })
  }

  /** The translation is read in the speaker's voice from now on, in the player, Studio and the MP3 */
  useVoice(userId: string, documentId: string, voiceId: string) {
    return this.db.playbackState.upsert({
      where: { userId_documentId: { userId, documentId } },
      create: { userId, documentId, voiceId },
      update: { voiceId },
    })
  }
}
