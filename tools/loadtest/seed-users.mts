// Creates the 300 load-test users (run with DATABASE_URL pointing at a throwaway database, never Supabase)
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { prisma } from '../../backend/src/config/db.ts'
import { hashPassword } from '../../backend/src/utils/password.ts'
const hash = await hashPassword('load-pass-123')
const users = Array.from({ length: 300 }, (_, i) => ({ email: `load${i}@test.local`, name: `Load ${i}`, passwordHash: hash, emailVerifiedAt: new Date(), plan: i % 3 === 0 ? 'free' : 'plus' }))
await prisma.user.createMany({ data: users, skipDuplicates: true })
const found = await prisma.user.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true, email: true }, orderBy: { email: 'asc' } })
// Access tokens name a live login session (sid), so each user gets one
const rows = found.map((u) => ({ ...u, sid: randomUUID() }))
await prisma.refreshToken.createMany({
  data: rows.map((u) => ({ familyId: u.sid, userId: u.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 30 * 24 * 3600_000) })),
})
writeFileSync(new URL('./load-users.json', import.meta.url), JSON.stringify(rows))
console.log(rows.length, 'users')
await prisma.$disconnect()
