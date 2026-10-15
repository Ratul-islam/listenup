import { Prisma, type PrismaClient } from '../../generated/prisma/client.js'
import { readDelivery, type PartDelivery, type StudioSettings } from './studio-catalog.js'

const same = (a: PartDelivery, b: PartDelivery) => JSON.stringify(a) === JSON.stringify(b)

export class StudioRepository {
  constructor(private readonly db: PrismaClient) {}

  findOwned(userId: string, documentId: string) {
    return this.db.document.findFirst({ where: { id: documentId, userId }, select: { id: true, status: true, studio: true, publicationId: true } })
  }

  /** A ready script's words, in order, and its settings */
  async scriptOf(userId: string, documentId: string) {
    const doc = await this.db.document.findFirst({ where: { id: documentId, userId }, select: { id: true, status: true, studio: true, language: true, chunks: { orderBy: { index: 'asc' }, select: { text: true } } } })
    return doc && { ...doc, text: doc.chunks.map((c) => c.text).join('\n\n') }
  }

  /** Saves a script's settings as they are, without touching its parts (what to post with it) */
  saveStudio(documentId: string, studio: Record<string, unknown>) {
    return this.db.document.update({ where: { id: documentId }, data: { studio: studio as Prisma.InputJsonValue } })
  }

  /**
   * Saves a script's settings and gives every part that isn't locked the voice settings that
   * go with them. Returns how many parts' audio that changes.
   */
  save(documentId: string, studio: StudioSettings & Record<string, unknown>, delivery: PartDelivery | null) {
    return this.db.$transaction(async (tx) => {
      await tx.document.update({ where: { id: documentId }, data: { studio: studio as Prisma.InputJsonValue } })
      const parts = await tx.documentChunk.findMany({ where: { documentId, locked: false }, select: { id: true, delivery: true } })
      const wanted = delivery ?? {}
      const changed = parts.filter((p) => !same(readDelivery(p.delivery), readDelivery(wanted))).map((p) => p.id)
      if (changed.length) {
        await tx.documentChunk.updateMany({ where: { id: { in: changed } }, data: { delivery: delivery ? (delivery as Prisma.InputJsonValue) : Prisma.DbNull } })
      }
      return changed.length
    })
  }
}
