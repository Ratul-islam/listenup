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

  findBlob(hash: string) {
    return this.db.audioBlob.findUnique({ where: { hash } })
  }

  /** Records a generated file; a concurrent identical one keeps the first row */
  saveBlob(data: Prisma.AudioBlobCreateInput) {
    return this.db.audioBlob.upsert({ where: { hash: data.hash }, create: data, update: {} })
  }

  /** Shared files no clip plays any more, older than `before` */
  orphanBlobs(before: Date, take: number) {
    return this.db.audioBlob.findMany({ where: { clips: { none: {} }, createdAt: { lt: before } }, take, select: { hash: true, storageKey: true } })
  }

  deleteBlob(hash: string) {
    return this.db.audioBlob.deleteMany({ where: { hash, clips: { none: {} } } })
  }
}
