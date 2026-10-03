import { prisma } from '../../config/db.js'
import { queue, QUEUES } from '../../lib/queue.js'
import { UsersRepository } from './users.repository.js'
import { UsersService } from './users.service.js'

/** Erases closed accounts once their grace period ends, daily at 03:00 */
export async function startUsersWorker() {
  const users = new UsersService(new UsersRepository(prisma))
  await queue.schedule(QUEUES.purgeClosedAccounts, '0 3 * * *')
  await queue.work(QUEUES.purgeClosedAccounts, async () => {
    await users.purgeClosedAccounts()
  })
}
