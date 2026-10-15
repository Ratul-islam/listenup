import type { Document, DocumentChunk, DocumentKind, Prisma, PrismaClient } from '../../generated/prisma/client.js'
import type { PartDelivery } from '../studio/studio-catalog.js'
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

  /** The listener's document made from a shared text (a free classic), if they have one */
  findOwnedByFileKey(userId: string, fileKey: string) {
    return this.db.document.findFirst({
      where: { userId, fileKey },
      include: { playback: { where: { userId } } },
      orderBy: { createdAt: 'asc' },
    })
  }

  findOwned(userId: string, id: string) {
    return this.db.document.findFirst({
      where: { id, userId, masterOf: { is: null } },
      include: { playback: { where: { userId } } },
    })
  }

  /** A writing in Explore's Community, with its frozen copy's parts */
  findLiveWriting(id: string) {
    return this.db.publication.findFirst({
      where: { id, kind: 'WRITING', status: 'LIVE', user: { closedAt: null } },
      include: { user: { select: { penName: true } }, master: { include: { chunks: { orderBy: { index: 'asc' } } } } },
    })
  }

  /** The listener's copy of a Community writing, if they've added it */
  findCopy(userId: string, publicationId: string) {
    return this.db.document.findFirst({ where: { userId, publicationId }, include: { playback: { where: { userId } } } })
  }

  /**
   * A listener's own copy of a Community writing: the frozen parts as they
   * are (emotions, takes, character voices, the writer's pronunciations), set
   * to play in the writer's voice. Its audio already exists, so it costs nobody anything.
   */
  async copyPublication(userId: string, publication: { id: string; voiceId: string }, master: Document & { chunks: DocumentChunk[] }, author: string | null) {
    return this.db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          userId,
          publicationId: publication.id,
          title: master.title,
          author,
          // Shelved with books; the text is plain
          kind: 'EPUB',
          mimeType: 'text/plain',
          status: 'READY',
          language: master.language,
          excerpt: master.excerpt,
          charCount: master.charCount,
          chunkCount: master.chunkCount,
          estimatedDurationSec: master.estimatedDurationSec,
          narrationStyle: master.narrationStyle,
          narrationStrength: master.narrationStrength,
        },
      })
      await tx.documentChunk.createMany({
        data: master.chunks.map((c) => ({
          documentId: doc.id,
          index: c.index,
          text: c.text,
          language: c.language,
          sentences: c.sentences as Prisma.InputJsonValue,
          expressions: (c.expressions ?? undefined) as Prisma.InputJsonValue | undefined,
          narration: c.narration,
          take: c.take,
          sentenceTakes: (c.sentenceTakes ?? undefined) as Prisma.InputJsonValue | undefined,
          voiceId: c.voiceId,
          pauseAfterMs: c.pauseAfterMs,
          locked: c.locked,
          lockedLexicon: (c.lockedLexicon ?? undefined) as Prisma.InputJsonValue | undefined,
          delivery: (c.delivery ?? undefined) as Prisma.InputJsonValue | undefined,
          estimatedDurationSec: c.estimatedDurationSec,
        })),
      })
      await tx.playbackState.create({ data: { userId, documentId: doc.id, voiceId: publication.voiceId } })
      await tx.publication.update({ where: { id: publication.id }, data: { listens: { increment: 1 } } })
      return tx.document.findUniqueOrThrow({ where: { id: doc.id }, include: { playback: { where: { userId } } } })
    })
  }

  findDigest(userId: string, digestDay: string) {
    return this.db.document.findUnique({ where: { userId_digestDay: { userId, digestDay } }, include: { playback: { where: { userId } } } })
  }

  /** Recently added or played documents for the daily digest (never earlier digests) */
  recentForDigest(userId: string, since: Date, take: number) {
    return this.db.document.findMany({
      where: {
        userId,
        status: 'READY',
        digestDay: null,
        masterOf: { is: null },
        OR: [{ createdAt: { gte: since } }, { playback: { some: { userId, updatedAt: { gte: since } } } }],
      },
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
        // A published writing's frozen copy is never on the shelf
        masterOf: { is: null },
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
    return this.db.document.groupBy({ by: ['kind'], where: { userId, isScript: scripts, masterOf: { is: null } }, _count: { _all: true } })
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

  /** Atomically swaps in a fresh set of chunks (also clears cached audio via cascade); `delivery` is a script's voice settings */
  replaceChunks(documentId: string, chunks: ChunkDraft[], data: Prisma.DocumentUncheckedUpdateInput, delivery: PartDelivery | null = null) {
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
          ...(delivery && { delivery: delivery as Prisma.InputJsonValue }),
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

  /** The silences measured in one part's voiced audio, which say when its text is spoken; null until measured */
  async clipPauses(documentId: string, index: number, voiceId: string) {
    const clip = await this.db.audioClip.findFirst({
      where: { chunk: { documentId, index }, voiceId, status: 'READY', mimeType: 'audio/mpeg' },
      select: { blob: { select: { pauses: true } } },
    })
    return clip?.blob?.pauses ?? null
  }
}
