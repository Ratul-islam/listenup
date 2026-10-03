import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'

export class TtsRepository {
  constructor(private readonly db: PrismaClient) {}

  find(chunkId: string, voiceId: string) {
    return this.db.audioClip.findUnique({ where: { chunkId_voiceId: { chunkId, voiceId } } })
  }

  create(data: Prisma.AudioClipUncheckedCreateInput) {
    return this.db.audioClip.create({ data })
  }

  update(id: string, data: Prisma.AudioClipUncheckedUpdateInput) {
    return this.db.audioClip.update({ where: { id }, data })
  }

  delete(id: string) {
    return this.db.audioClip.deleteMany({ where: { id } })
  }
}
