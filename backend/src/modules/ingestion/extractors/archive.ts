import { Worker } from 'node:worker_threads'
import { AppError } from '../../../utils/AppError.js'
import { oneAtATime } from './one-at-a-time.js'
import type { Extracted } from './types.js'

// The worker's own heap. Unpacking is capped (lib/zip.ts), but a capped file can still
// hold millions of tiny XML tags, and mammoth builds a node for each one
const HEAP_MB = 192
const TIMEOUT_MS = 60_000

/**
 * The build runs the compiled worker. In development (tsx) a worker thread doesn't
 * get tsx's loader, so it registers it before importing the .ts worker.
 */
function startWorker(options: ConstructorParameters<typeof Worker>[1]) {
  if (!import.meta.url.endsWith('.ts')) return new Worker(new URL('./archive.worker.js', import.meta.url), options)
  const tsx = JSON.stringify(import.meta.resolve('tsx/esm/api'))
  const file = JSON.stringify(new URL('./archive.worker.ts', import.meta.url).href)
  return new Worker(`import(${tsx}).then(({ register }) => { register(); return import(${file}) })`, { ...options, eval: true })
}

const tooBig = () =>
  new AppError('This file is too big to read once it’s unpacked. Try splitting it into smaller files.', 422, 'FILE_TOO_LARGE')

type Reply = { ok: true; extracted: Extracted } | { ok: false; error: { app: boolean; message: string; statusCode?: number; code?: string } }

function runWorker(kind: 'DOCX' | 'EPUB', file: Buffer) {
  return new Promise<Extracted>((resolve, reject) => {
    const worker = startWorker({
      workerData: { kind, file },
      resourceLimits: { maxOldGenerationSizeMb: HEAP_MB, maxYoungGenerationSizeMb: 32 },
    })
    const timer = setTimeout(() => {
      void worker.terminate()
      reject(tooBig())
    }, TIMEOUT_MS)
    const done = () => {
      clearTimeout(timer)
      void worker.terminate()
    }
    worker.once('message', (reply: Reply) => {
      done()
      if (reply.ok) return resolve(reply.extracted)
      const { app, message, statusCode, code } = reply.error
      reject(app ? new AppError(message, statusCode, code) : new Error(message))
    })
    worker.once('error', (e: NodeJS.ErrnoException) => {
      done()
      reject(e.code === 'ERR_WORKER_OUT_OF_MEMORY' ? tooBig() : e)
    })
    // Settles nothing if a message or error came first
    worker.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`archive worker stopped (${code})`))
    })
  })
}

/**
 * Reads an EPUB or DOCX in a separate thread with its own memory limit, one file
 * at a time. A file built to blow up when opened then fails on its own instead of
 * taking the server (and every listener on it) down.
 */
export function extractArchive(kind: 'DOCX' | 'EPUB', file: Buffer): Promise<Extracted> {
  return oneAtATime(() => runWorker(kind, file))
}
