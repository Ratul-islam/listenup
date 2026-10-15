import { parentPort, workerData } from 'node:worker_threads'
import { AppError } from '../../../utils/AppError.js'
import { extractDocx } from './docx.extractor.js'
import { extractEpub } from './epub.extractor.js'

// Runs one EPUB or DOCX extraction in its own thread (see archive.ts)
const { kind, file } = workerData as { kind: 'DOCX' | 'EPUB'; file: Uint8Array }
const buffer = Buffer.from(file.buffer, file.byteOffset, file.byteLength)

try {
  const extracted = await (kind === 'EPUB' ? extractEpub(buffer) : extractDocx(buffer))
  parentPort!.postMessage({ ok: true, extracted })
} catch (e) {
  const error = e instanceof AppError
    ? { app: true, message: e.message, statusCode: e.statusCode, code: e.code }
    : { app: false, message: e instanceof Error ? e.message : String(e) }
  parentPort!.postMessage({ ok: false, error })
}
