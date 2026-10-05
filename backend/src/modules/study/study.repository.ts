import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'
import type { StudyKind } from './study.schema.js'

export class StudyRepository {
  constructor(private readonly db: PrismaClient) {}

  findOwnedDocument(userId: string, documentId: string) {
    return this.db.document.findFirst({ where: { id: documentId, userId } })
  }

  findUserPlan(userId: string) {
    return this.db.user.findUnique({ where: { id: userId }, select: { plan: true } })
  }

  listChunks(documentId: string) {
    return this.db.documentChunk.findMany({ where: { documentId }, orderBy: { index: 'asc' }, select: { text: true, sentences: true } })
  }

  find(documentId: string, kind: StudyKind) {
    return this.db.studyAid.findUnique({ where: { documentId_kind: { documentId, kind } } })
  }

  save(documentId: string, kind: StudyKind, sourceKey: string, content: Prisma.InputJsonValue) {
    return this.db.studyAid.upsert({
      where: { documentId_kind: { documentId, kind } },
      create: { documentId, kind, sourceKey, content },
      update: { sourceKey, content },
    })
  }
}
