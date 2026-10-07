import type { PrismaClient } from '../../generated/prisma/client.js'

export class PronunciationsRepository {
  constructor(private readonly db: PrismaClient) {}

  list(userId: string) {
    return this.db.pronunciation.findMany({ where: { userId }, orderBy: { word: 'asc' } })
  }

  rules(userId: string) {
    return this.db.pronunciation.findMany({ where: { userId }, select: { word: true, sayAs: true } })
  }

  count(userId: string) {
    return this.db.pronunciation.count({ where: { userId } })
  }

  findOwned(userId: string, id: string) {
    return this.db.pronunciation.findFirst({ where: { id, userId } })
  }

  /** The same word in any case ("gif" and "GIF" are one rule) */
  findWord(userId: string, word: string) {
    return this.db.pronunciation.findFirst({ where: { userId, word: { equals: word, mode: 'insensitive' } } })
  }

  create(userId: string, word: string, sayAs: string) {
    return this.db.pronunciation.create({ data: { userId, word, sayAs } })
  }

  update(id: string, data: { word?: string; sayAs?: string }) {
    return this.db.pronunciation.update({ where: { id }, data })
  }

  delete(id: string) {
    return this.db.pronunciation.delete({ where: { id } })
  }
}
