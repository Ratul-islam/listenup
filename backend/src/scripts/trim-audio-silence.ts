/**
 * Trims the long silence at the start and end of audio made before clips were
 * trimmed as they're made (8 October 2026), so paragraphs follow each other
 * without a long stop. Whole MP3 frames are cut, so nothing is re-encoded, and
 * running it again changes nothing. Shows what it would do unless --apply is given:
 *
 *   pnpm audio:trim-silence            (dry run)
 *   pnpm audio:trim-silence --apply
 */
import { prisma } from '../config/db.js'
import { decodeMp3, pausesIn } from '../lib/audio/pauses.js'
import { peaksOf } from '../lib/audio/peaks.js'
import { trimMp3 } from '../lib/audio/trim.js'
import { storage } from '../lib/storage/storage.js'

const apply = process.argv.includes('--apply')
const BATCH = 50

let cursor: string | undefined
let seen = 0
let trimmed = 0
let failed = 0
let savedMs = 0
for (;;) {
  const blobs = await prisma.audioBlob.findMany({
    where: { mimeType: 'audio/mpeg' },
    orderBy: { hash: 'asc' },
    take: BATCH,
    ...(cursor && { cursor: { hash: cursor }, skip: 1 }),
    select: { hash: true, storageKey: true, durationMs: true },
  })
  if (!blobs.length) break
  for (const blob of blobs) {
    seen++
    try {
      const cut = await trimMp3(await storage.get(blob.storageKey))
      if (!cut) continue
      trimmed++
      savedMs += blob.durationMs - cut.durationMs
      if (!apply) continue
      // The silences and waveform move with the audio
      const decoded = await decodeMp3(cut.audio)
      await storage.put(blob.storageKey, cut.audio, 'audio/mpeg')
      await prisma.$transaction([
        prisma.audioBlob.update({
          where: { hash: blob.hash },
          data: { durationMs: cut.durationMs, sizeBytes: cut.audio.length, pauses: pausesIn(decoded).map(([from, to]) => [from, to]), peaks: peaksOf(decoded) },
        }),
        prisma.audioClip.updateMany({ where: { blobHash: blob.hash }, data: { durationMs: cut.durationMs } }),
      ])
    } catch (e) {
      failed++
      console.warn(`${blob.hash.slice(0, 8)} (${blob.storageKey}): ${e instanceof Error ? e.message : e}`)
    }
  }
  cursor = blobs.at(-1)!.hash
  console.log(`${seen} checked, ${trimmed} ${apply ? 'trimmed' : 'to trim'}`)
}

const average = trimmed ? Math.round(savedMs / trimmed) : 0
console.log(
  `${apply ? 'Trimmed' : 'Would trim'} ${trimmed} of ${seen} files, ${average} ms of silence each on average` +
    `${failed ? `; ${failed} couldn't be read` : ''}.${apply ? '' : ' Run again with --apply to save the changes.'}`,
)
await prisma.$disconnect()
