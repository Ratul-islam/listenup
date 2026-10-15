import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'

export class VoicesRepository {
  constructor(private readonly db: PrismaClient) {}

  findPreference(userId: string) {
    return this.db.userPreference.findUnique({ where: { userId } })
  }

  /** A listener's saved choices, with their plan and own voice (which the plan decides the use of) */
  findListener(userId: string) {
    return this.db.user.findUnique({
      where: { id: userId },
      select: { plan: true, preference: true, ownVoice: true, speakerVoices: { include: { document: { select: { title: true } } } } },
    })
  }

  upsertPreference(userId: string, data: Omit<Prisma.UserPreferenceUncheckedCreateInput, 'userId'>) {
    return this.db.userPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data })
  }
}
