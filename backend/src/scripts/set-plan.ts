/**
 * Sets a user's plan by email, until purchases go through Google Play:
 *
 *   pnpm user:set-plan someone@example.com plus
 */
import { prisma } from '../config/db.js'
import { PLANS } from '../modules/plans/plan-catalog.js'

const [email, plan] = process.argv.slice(2)
if (!email || !PLANS.some((p) => p.id === plan)) {
  console.error(`Usage: pnpm user:set-plan <email> <${PLANS.map((p) => p.id).join('|')}>`)
  process.exit(1)
}
const { count } = await prisma.user.updateMany({ where: { email: email.toLowerCase() }, data: { plan } })
console.log(count ? `${email} is now on ${plan}` : `No user with email ${email}`)
await prisma.$disconnect()
