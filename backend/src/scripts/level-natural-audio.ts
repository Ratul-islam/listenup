/**
 * Brings Natural (Kokoro) audio made before 13 October 2026 to the loudness
 * every voice is made at now. It was about 9 dB quieter than Expressive audio,
 * so a document with both, or a change of voice, changed the volume.
 *
 * The Natural voices' samples on the Voices page are brought up with them.
 *
 * Each file is decoded, levelled and encoded again at the same bitrate, which
 * makes it about 0.05 s longer; its length, silences and waveform are measured
 * again and saved with it, so the highlight stays in step. Files already at
 * the level are left alone, so running it again changes nothing. Nobody is
 * charged: no speech is made. Shows what it would do unless --apply is given:
 *
 *   pnpm audio:level-natural            (dry run)
 *   pnpm audio:level-natural --apply
 */
import { prisma } from '../config/db.js'
import type { Prisma } from '../generated/prisma/client.js'
import { pcmToMp3 } from '../lib/audio/encode.js'
import { levelPcm, speechLevel, SPEECH_LEVEL_DB } from '../lib/audio/level.js'
import { normalizeMp3 } from '../lib/audio/mp3.js'
import { decodeMp3, markJoins, pausesIn, type Pause } from '../lib/audio/pauses.js'
import { peaksOf } from '../lib/audio/peaks.js'
import { storage } from '../lib/storage/storage.js'
import { previewPrefix } from '../modules/tts/tts.service.js'
import { VOICES } from '../modules/voices/voice-catalog.js'

const apply = process.argv.includes('--apply')
const BATCH = 50
// Closer to the level than this is close enough; an MP3 doesn't come back at exactly the level it was made at
const CLOSE_DB = 1.5

let cursor: string | undefined
let seen = 0
let levelled = 0
let failed = 0
let liftedDb = 0
for (;;) {
  const blobs = await prisma.audioBlob.findMany({
    where: { mimeType: 'audio/mpeg', model: { contains: 'kokoro' } },
    orderBy: { hash: 'asc' },
    take: BATCH,
    ...(cursor && { cursor: { hash: cursor }, skip: 1 }),
    select: { hash: true, storageKey: true, durationMs: true, pauses: true },
  })
  if (!blobs.length) break
  for (const blob of blobs) {
    seen++
    try {
      const result = await atLevel(await storage.get(blob.storageKey))
      if (!result) continue
      levelled++
      liftedDb += result.liftedDb
      if (!apply) continue
      const { audio, durationMs } = result
      const made = await decodeMp3(audio)
      // Where a joined recording's takes start is kept: each is found again at its silence, which moved with the audio
      const shift = durationMs - blob.durationMs
      const joins = ((blob.pauses as Pause[] | null) ?? []).filter((p) => p[2] !== undefined).map((p) => ({ at: p[2]!, ms: (p[0] + p[1]) / 2 + shift }))
      await storage.put(blob.storageKey, audio, 'audio/mpeg')
      await prisma.$transaction([
        prisma.audioBlob.update({ where: { hash: blob.hash }, data: { durationMs, sizeBytes: audio.length, pauses: markJoins(pausesIn(made), joins) as Prisma.InputJsonValue, peaks: peaksOf(made) } }),
        prisma.audioClip.updateMany({ where: { blobHash: blob.hash }, data: { durationMs } }),
      ])
    } catch (e) {
      failed++
      console.warn(`${blob.hash.slice(0, 8)} (${blob.storageKey}): ${e instanceof Error ? e.message : e}`)
    }
  }
  cursor = blobs.at(-1)!.hash
  console.log(`${seen} checked, ${levelled} ${apply ? 'levelled' : 'to level'}`)
}

/** A file's audio at the level, or null when it's already there */
async function atLevel(mp3: Buffer) {
  const decoded = await decodeMp3(mp3)
  const level = speechLevel(decoded.samples, decoded.sampleRate)
  if (level === null || Math.abs(SPEECH_LEVEL_DB - level) < CLOSE_DB) return null
  const pcm = Buffer.alloc(decoded.samples.length * 2)
  decoded.samples.forEach((v, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2))
  return { ...normalizeMp3(pcmToMp3(levelPcm(pcm, decoded.sampleRate), decoded.sampleRate)), liftedDb: SPEECH_LEVEL_DB - level }
}

// The samples played on the Voices page, one file a voice
let samples = 0
for (const voice of VOICES.filter((v) => v.tier === 'natural')) {
  const key = `${previewPrefix('openrouter', voice)}.mp3`
  try {
    if (!(await storage.exists(key))) continue
    const made = await atLevel(await storage.get(key))
    if (!made) continue
    samples++
    if (apply) await storage.put(key, made.audio, 'audio/mpeg')
  } catch (e) {
    failed++
    console.warn(`${voice.name}'s sample (${key}): ${e instanceof Error ? e.message : e}`)
  }
}

const average = levelled ? (liftedDb / levelled).toFixed(1) : '0'
console.log(
  `${apply ? 'Levelled' : 'Would level'} ${levelled} of ${seen} Natural files, by ${average} dB on average, and ${samples} voice samples` +
    `${failed ? `; ${failed} couldn't be read` : ''}.${apply ? '' : ' Run again with --apply to save the changes.'}`,
)
await prisma.$disconnect()
