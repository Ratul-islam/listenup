import type { DocumentKind, Prisma, PrismaClient } from '../../generated/prisma/client.js'
import type { ChunkDraft } from '../ingestion/text/chunker.js'
import type { ListQuery } from './documents.schema.js'

export const CATEGORY_KINDS: Record<Exclude<ListQuery['category'], 'all'>, DocumentKind[]> = {
  books: ['PDF', 'EPUB', 'DOCX'],
  articles: ['WEB'],
  notes: ['TEXT', 'MARKDOWN'],
  scans: ['IMAGE'],
}

export class DocumentsRepository {
  constructor(private readonly db: PrismaClient) {}

  create(data: Prisma.DocumentUncheckedCreateInput) {
    return this.db.document.create({ data })
  }

  findById(id: string) {
    return this.db.document.findUnique({ where: { id } })
  }

  findOwned(userId: string, id: string) {
    return this.db.document.findFirst({
      where: { id, userId },
      include: { playback: { where: { userId } } },
    })
  }

  findDigest(userId: string, digestDay: string) {
    return this.db.document.findUnique({ where: { userId_digestDay: { userId, digestDay } }, include: { playback: { where: { userId } } } })
  }

  /** Recently added or played documents for the daily digest (never earlier digests) */
  recentForDigest(userId: string, since: Date, take: number) {
    return this.db.document.findMany({
      where: { userId, status: 'READY', digestDay: null, OR: [{ createdAt: { gte: since } }, { playback: { some: { userId, updatedAt: { gte: since } } } }] },
      orderBy: { updatedAt: 'desc' },
      take,
      include: { chunks: { orderBy: { index: 'asc' }, take: 20, select: { text: true } } },
    })
  }

  list(userId: string, { view, category, q, sort, folder }: ListQuery) {
    return this.db.document.findMany({
      where: {
        userId,
        isScript: view === 'scripts',
        ...(folder && { folderId: folder === 'root' ? null : folder }),
        ...(category !== 'all' && { kind: { in: CATEGORY_KINDS[category] } }),
        ...(q && {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { author: { contains: q, mode: 'insensitive' } },
            { excerpt: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      include: { playback: { where: { userId } } },
      orderBy: sort === 'title' ? { title: 'asc' } : { createdAt: 'desc' },
      take: 200,
    })
  }

  countByKind(userId: string, scripts: boolean) {
    return this.db.document.groupBy({ by: ['kind'], where: { userId, isScript: scripts }, _count: { _all: true } })
  }

  findOwnedFolder(userId: string, id: string) {
    return this.db.folder.findFirst({ where: { id, userId }, select: { id: true } })
  }

  update(id: string, data: Prisma.DocumentUncheckedUpdateInput) {
    return this.db.document.update({ where: { id }, data })
  }

  delete(id: string) {
    return this.db.document.delete({ where: { id } })
  }

  /** Atomically swaps in a fresh set of chunks (also clears cached audio via cascade) */
  replaceChunks(documentId: string, chunks: ChunkDraft[], data: Prisma.DocumentUncheckedUpdateInput) {
    return this.db.$transaction([
      this.db.documentChunk.deleteMany({ where: { documentId } }),
      this.db.documentChunk.createMany({
        data: chunks.map((c, index) => ({
          documentId,
          index,
          text: c.text,
          language: c.language,
          sentences: c.sentences as unknown as Prisma.InputJsonValue,
          estimatedDurationSec: c.estimatedDurationSec,
        })),
      }),
      this.db.document.update({ where: { id: documentId }, data }),
    ])
  }

  listChunks(documentId: string) {
    return this.db.documentChunk.findMany({ where: { documentId }, orderBy: { index: 'asc' } })
  }

  /** Chunks already voiced (with real durations) in the given voices */
  readyClips(documentId: string, voiceIds: string[]) {
    return this.db.audioClip.findMany({
      where: { chunk: { documentId }, voiceId: { in: voiceIds }, status: 'READY' },
      select: { voiceId: true, durationMs: true, renderKey: true, chunk: { select: { index: true } }, blob: { select: { peaks: true } } },
    })
  }
}
