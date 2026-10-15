import { AppError } from '../../../utils/AppError.js'
import { extractPdf } from './pdf.extractor.js'
import { pdfPageCount, splitPdf } from './pdf-pages.js'

// Runs one PDF job in its own process (see pdf-process.ts) and exits
type Job = { op: 'extract' | 'pageCount' | 'split'; file: Uint8Array }

process.once('message', async ({ op, file }: Job) => {
  const buffer = Buffer.from(file.buffer, file.byteOffset, file.byteLength)
  let reply: unknown
  try {
    const result = op === 'extract' ? await extractPdf(buffer) : op === 'pageCount' ? await pdfPageCount(buffer) : await splitPdf(buffer)
    reply = { ok: true, result }
  } catch (e) {
    reply = {
      ok: false,
      error: e instanceof AppError
        ? { app: true, message: e.message, statusCode: e.statusCode, code: e.code }
        : { app: false, message: e instanceof Error ? e.message : String(e) },
    }
  }
  process.send!(reply, () => process.exit(0))
})
