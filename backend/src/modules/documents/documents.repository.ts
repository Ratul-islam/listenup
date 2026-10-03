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

  list(userId: string, { category, q, sort, folder }: ListQuery) {
    return this.db.document.findMany({
      where: {
        userId,
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

  countByKind(userId: string) {
    return this.db.document.groupBy({ by: ['kind'], where: { userId }, _count: { _all: true } })
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
      select: { voiceId: true, durationMs: true, renderKey: true, chunk: { select: { index: true } } },
    })
  }
}
