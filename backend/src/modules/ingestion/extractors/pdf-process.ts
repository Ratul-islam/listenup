import { fork } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { AppError } from '../../../utils/AppError.js'
import { oneAtATime } from './one-at-a-time.js'
import type { PdfPart } from './pdf-pages.js'
import type { Extracted } from './types.js'

/**
 * What the PDF process may use in all. A thread's memory limit doesn't hold
 * pdf.js: most of what a crafted PDF makes it allocate is buffers outside the
 * JavaScript heap (a 400 KB file reached about 940 MB). A process can be
 * watched as a whole and stopped.
 */
const MEMORY_MB = 320
const HEAP_MB = 256
const TIMEOUT_MS = 90_000
// How often its memory is looked at; a bomb grows by tens of MB in that time, not hundreds
const WATCH_MS = 20

// tsx runs the .ts sources in development (the child inherits its loader); the build runs the .js
const CHILD_FILE = new URL(`./pdf.child.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url)

const tooBig = () =>
  new AppError('This PDF is too big or too complex to read. Try splitting it into smaller files.', 422, 'FILE_TOO_LARGE')

/** The process's resident memory in MB, from Linux's /proc; null where there's none (macOS) */
function residentMb(pid: number) {
  try {
    const kb = /VmRSS:\s+(\d+) kB/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1]
    return kb ? Number(kb) / 1024 : null
  } catch {
    return null
  }
}

type Reply<T> = { ok: true; result: T } | { ok: false; error: { app: boolean; message: string; statusCode?: number; code?: string } }

function run<T>(op: 'extract' | 'pageCount' | 'split', file: Buffer) {
  return new Promise<T>((resolve, reject) => {
    const child = fork(CHILD_FILE, {
      execArgv: [...process.execArgv.filter((a) => !a.startsWith('--max-old-space-size')), `--max-old-space-size=${HEAP_MB}`],
      serialization: 'advanced',
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    let settled = false
    const finish = (error: Error | null, value?: T) => {
      if (settled) return
      settled = true
      clearInterval(watch)
      clearTimeout(timer)
      if (child.exitCode === null) child.kill('SIGKILL')
      if (error) reject(error)
      else resolve(value as T)
    }
    const watch = setInterval(() => {
      const mb = child.pid ? residentMb(child.pid) : null
      if (mb !== null && mb > MEMORY_MB) {
        console.warn(`[pdf] stopped a ${op} at ${Math.round(mb)} MB`)
        finish(tooBig())
      }
    }, WATCH_MS)
    const timer = setTimeout(() => finish(tooBig()), TIMEOUT_MS)

    child.once('message', (reply: Reply<T>) => {
      if (reply.ok) return finish(null, reply.result)
      const { app, message, statusCode, code } = reply.error
      finish(app ? new AppError(message, statusCode, code) : new Error(message))
    })
    child.once('error', (e) => finish(e))
    // Out of heap (or killed from outside) before it could answer
    child.once('exit', (code, signal) => finish(signal || code ? tooBig() : new Error('pdf process ended without an answer')))
    child.send({ op, file })
  })
}

/*
 * Each PDF job runs in a process of its own, one at a time, watched: over its
 * memory or time limit, it's killed and the file fails with a clear message,
 * and the server and everyone listening on it carry on.
 */

/** Text-based PDF → paragraphs (pdf.extractor.ts) */
export const extractPdfIsolated = (file: Buffer) => oneAtATime(() => run<Extracted>('extract', file))

/** Pages in a PDF (pdf-pages.ts) */
export const pdfPageCountIsolated = (file: Buffer) => oneAtATime(() => run<number>('pageCount', file))

/** The PDF cut into parts for OCR (pdf-pages.ts) */
export const splitPdfIsolated = async (file: Buffer) =>
  (await oneAtATime(() => run<PdfPart[]>('split', file))).map((p) => ({ pages: p.pages, bytes: Buffer.from(p.bytes) }))
