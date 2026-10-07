// Creates the 300 load-test users (run with DATABASE_URL pointing at a throwaway database, never Supabase)
import { writeFileSync } from 'node:fs'
import { prisma } from '../../backend/src/config/db.ts'
import { hashPassword } from '../../backend/src/utils/password.ts'
const hash = await hashPassword('load-pass-123')
const users = Array.from({ length: 300 }, (_, i) => ({ email: `load${i}@test.local`, name: `Load ${i}`, passwordHash: hash, emailVerifiedAt: new Date(), plan: i % 3 === 0 ? 'free' : 'plus' }))
await prisma.user.createMany({ data: users, skipDuplicates: true })
const rows = await prisma.user.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true, email: true }, orderBy: { email: 'asc' } })
writeFileSync(new URL('./load-users.json', import.meta.url), JSON.stringify(rows))
console.log(rows.length, 'users')
await prisma.$disconnect()
