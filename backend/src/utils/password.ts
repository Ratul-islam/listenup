import crypto from 'node:crypto'

// scrypt cost parameters are stored with each hash so they can be raised later
// without invalidating existing passwords.
const N = 2 ** 15
const R = 8
const P = 1
const KEY_LENGTH = 64
const MAX_MEM = 64 * 1024 * 1024

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    )
  })
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt, N, R, P)
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, n, r, p, salt, hash] = stored.split('$')
  if (algo !== 'scrypt' || !salt || !hash) return false

  const expected = Buffer.from(hash, 'base64')
  const key = await scrypt(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p))
  return key.length === expected.length && crypto.timingSafeEqual(key, expected)
}

// Burns the same CPU as a real check so unknown emails can't be detected by timing.
let dummyHash: Promise<string> | undefined
export async function fakePasswordCheck(password: string) {
  dummyHash ??= hashPassword('dummy-password-for-timing')
  await verifyPassword(password, await dummyHash)
  return false
}
