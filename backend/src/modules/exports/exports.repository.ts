import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'

export class ExportsRepository {
  constructor(private readonly db: PrismaClient) {}

  findDocument(documentId: string) {
    return this.db.document.findUnique({ where: { id: documentId }, include: { playback: { take: 1 }, export: true, offline: true } })
  }

  findOwnedDocument(userId: string, documentId: string) {
    return this.db.document.findFirst({ where: { id: documentId, userId }, include: { playback: { where: { userId } }, export: true, offline: true } })
  }

  findUserPlan(userId: string) {
    return this.db.user.findUnique({ where: { id: userId }, select: { plan: true } })
  }

  listChunks(documentId: string) {
    return this.db.documentChunk.findMany({ where: { documentId }, orderBy: { index: 'asc' } })
  }

  /** Ready clips of a document, to tell which chunks still need voicing */
  readyClips(documentId: string) {
    return this.db.audioClip.findMany({
      where: { chunk: { documentId }, status: 'READY' },
      select: { chunkId: true, voiceId: true, renderKey: true },
    })
  }

  /** Ready clips with their files, for an offline download's manifest */
  clipFiles(documentId: string) {
    return this.db.audioClip.findMany({
      where: { chunk: { documentId }, status: 'READY' },
      select: { chunkId: true, voiceId: true, renderKey: true, storageKey: true, durationMs: true, mimeType: true },
    })
  }

  upsertOffline(documentId: string, data: Omit<Prisma.OfflineDownloadUncheckedCreateInput, 'documentId'>) {
    return this.db.offlineDownload.upsert({ where: { documentId }, create: { documentId, ...data }, update: data })
  }

  /** Updates only if `jobId` is still the latest offline job; returns whether it was */
  async updateOfflineForJob(documentId: string, jobId: string, data: Prisma.OfflineDownloadUncheckedUpdateManyInput) {
    const { count } = await this.db.offlineDownload.updateMany({ where: { documentId, jobId }, data })
    return count > 0
  }

  upsert(documentId: string, data: Omit<Prisma.AudioExportUncheckedCreateInput, 'documentId'>) {
    return this.db.audioExport.upsert({ where: { documentId }, create: { documentId, ...data }, update: data })
  }

  /** Updates only if `jobId` is still the latest job; returns whether it was */
  async updateForJob(documentId: string, jobId: string, data: Prisma.AudioExportUncheckedUpdateManyInput) {
    const { count } = await this.db.audioExport.updateMany({ where: { documentId, jobId }, data })
    return count > 0
  }
}
