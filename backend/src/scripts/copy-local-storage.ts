/**
 * One-off: copies everything under STORAGE_LOCAL_DIR into the S3/R2 bucket,
 * keeping the same keys, so switching STORAGE_DRIVER to s3 loses nothing.
 * Safe to re-run: objects already in the bucket are skipped (pass --force to
 * overwrite). Run with STORAGE_DRIVER=s3 and the S3_* settings in .env:
 *
 *   pnpm storage:copy-to-bucket
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { ALLOWED_UPLOADS } from '../config/constants.js'
import { env } from '../config/env.js'
import { S3Storage } from '../lib/storage/s3-storage.js'

const CONCURRENCY = 8

const CONTENT_TYPES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(ALLOWED_UPLOADS).map(([ext, t]) => [ext, t.mime])),
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
}

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])))
  return nested.flat()
}

async function main() {
  if (env.STORAGE_DRIVER !== 's3') throw new Error('Set STORAGE_DRIVER=s3 (and the S3_* settings) before copying')
  const force = process.argv.includes('--force')
  const root = path.resolve(env.STORAGE_LOCAL_DIR)
  const bucket = new S3Storage()
  const files = await walk(root).catch(() => [] as string[])
  let copied = 0
  let skipped = 0

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    await Promise.all(
      files.slice(i, i + CONCURRENCY).map(async (file) => {
        const key = path.relative(root, file).split(path.sep).join('/')
        if (!force && (await bucket.exists(key))) {
          skipped++
          return
        }
        const ext = path.extname(file).slice(1).toLowerCase()
        await bucket.put(key, await fs.readFile(file), CONTENT_TYPES[ext] ?? 'application/octet-stream')
        copied++
      }),
    )
    process.stdout.write(`\r${Math.min(i + CONCURRENCY, files.length)}/${files.length}`)
  }
  console.log(`\nCopied ${copied}, already there ${skipped}, from ${root} to bucket "${env.S3_BUCKET}"`)
}

await main()
