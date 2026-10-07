import { Prisma, type PrismaClient } from '../../generated/prisma/client.js'
import type { Pause } from '../../lib/audio/pauses.js'

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

  /** Silences already found in shared audio files (with their waveform), by file */
  async blobPauses(hashes: string[]) {
    if (!hashes.length) return new Map<string, Pause[]>()
    const rows = await this.db.audioBlob.findMany({
      where: { hash: { in: hashes }, pauses: { not: Prisma.DbNull }, peaks: { not: Prisma.DbNull } },
      select: { hash: true, pauses: true },
    })
    return new Map(rows.map((r) => [r.hash, r.pauses as unknown as Pause[]]))
  }

  saveAnalysis(hash: string, pauses: Pause[], peaks: number[]) {
    return this.db.audioBlob.update({ where: { hash }, data: { pauses: pauses as unknown as Prisma.InputJsonValue, peaks } })
  }

  upsertOffline(documentId: string, data: Omit<Prisma.OfflineDownloadUncheckedCreateInput, 'documentId'>) {
    return this.db.offlineDownload.upsert({ where: { documentId }, create: { documentId, ...data }, update: data })
  }

  /** Updates only if `jobId` is still the latest offline job; returns whether it was */
  async updateOfflineForJob(documentId: string, jobId: string, data: Prisma.OfflineDownloadUncheckedUpdateManyInput) {
    const { count } = await this.db.offlineDownload.updateMany({ where: { documentId, jobId }, data })
    return count > 0
  }

  /** A stalled export (its process died) becomes FAILED, so it can be started again */
  async markStopped(documentId: string, jobId: string | null, error: string) {
    await this.db.audioExport.updateMany({ where: { documentId, jobId, status: 'RUNNING' }, data: { status: 'FAILED', error } })
    return this.db.audioExport.findUnique({ where: { documentId } })
  }

  async markOfflineStopped(documentId: string, jobId: string | null, error: string) {
    await this.db.offlineDownload.updateMany({ where: { documentId, jobId, status: 'RUNNING' }, data: { status: 'FAILED', error } })
    return this.db.offlineDownload.findUnique({ where: { documentId } })
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
