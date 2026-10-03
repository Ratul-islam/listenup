import { ACCOUNT_GRACE_DAYS } from '../../config/constants.js'
import type { User } from '../../generated/prisma/client.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { sendEmail } from '../../utils/email.js'
import { planFor } from '../plans/plan-catalog.js'
import { accountClosedEmail } from './users.emails.js'
import type { UsersRepository } from './users.repository.js'
import type { UpdateProfileBody } from './users.schema.js'

const DAY_MS = 86_400_000

/** When a closed account is erased */
export const deletionDate = (closedAt: Date) => new Date(closedAt.getTime() + ACCOUNT_GRACE_DAYS * DAY_MS)

// Shape returned to clients; never expose passwordHash
export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerifiedAt !== null,
    hasPassword: user.passwordHash !== null,
    plan: planFor(user.plan).id,
    createdAt: user.createdAt,
  }
}

export type PublicUser = ReturnType<typeof toPublicUser>

export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getProfile(userId: string) {
    const user = await this.usersRepository.findById(userId)
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND')
    return toPublicUser(user)
  }

  async updateProfile(userId: string, data: UpdateProfileBody) {
    const user = await this.usersRepository.update(userId, { name: data.name })
    return toPublicUser(user)
  }

  /**
   * Closes the account: signs out every device and schedules erasure after the
   * grace period. Signing in before then restores it (see AuthService).
   */
  async closeAccount(userId: string) {
    const user = await this.usersRepository.update(userId, { closedAt: new Date() })
    await this.usersRepository.revokeSessions(userId)
    const deleteAfter = deletionDate(user.closedAt!)
    await sendEmail({ to: user.email, ...accountClosedEmail(deleteAfter) }).catch((e) =>
      console.error(`[users] closure email to ${userId} failed`, e),
    )
    return { deleteAfter }
  }

  /** Erases accounts whose grace period has ended, files included */
  async purgeClosedAccounts() {
    const cutoff = new Date(Date.now() - ACCOUNT_GRACE_DAYS * DAY_MS)
    const users = await this.usersRepository.findClosedBefore(cutoff)
    for (const user of users) {
      await Promise.all([
        storage.deletePrefix(`documents/${user.id}`),
        ...user.documents.flatMap((d) => [storage.deletePrefix(`audio/${d.id}`), storage.deletePrefix(`exports/${d.id}`)]),
      ])
      await this.usersRepository.delete(user.id)
      console.log(`[users] erased closed account ${user.id}`)
    }
    return users.length
  }
}
