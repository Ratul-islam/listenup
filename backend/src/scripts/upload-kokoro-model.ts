/**
 * Uploads the on-device Kokoro package (built by tools/kokoro-model/build.py)
 * to storage, where the app downloads it from:
 *
 *   pnpm kokoro:upload [path/to/listenup-kokoro-v1.zip]
 *
 * It refuses a file that doesn't match src/config/on-device-voice.ts, so the
 * checksum phones verify against is always the uploaded file's.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { ON_DEVICE_MODEL } from '../config/on-device-voice.js'
import { storage } from '../lib/storage/storage.js'

const file = path.resolve(process.argv[2] ?? `../tools/kokoro-model/out/listenup-kokoro-v${ON_DEVICE_MODEL.version}.zip`)

const { size } = await stat(file)
const hash = createHash('sha256')
for await (const piece of createReadStream(file)) hash.update(piece as Buffer)
const sha256 = hash.digest('hex')

if (size !== ON_DEVICE_MODEL.bytes || sha256 !== ON_DEVICE_MODEL.sha256) {
  console.error(`${file} doesn't match src/config/on-device-voice.ts:`)
  console.error(`  file:   ${size} bytes, sha256 ${sha256}`)
  console.error(`  config: ${ON_DEVICE_MODEL.bytes} bytes, sha256 ${ON_DEVICE_MODEL.sha256}`)
  console.error('Copy the values from the build’s .json into the config, then run this again.')
  process.exit(1)
}

console.log(`Uploading ${(size / 1e6).toFixed(1)} MB to ${ON_DEVICE_MODEL.key}…`)
await storage.putStream(ON_DEVICE_MODEL.key, createReadStream(file), 'application/zip')
console.log('Done. Phones can download it now.')
