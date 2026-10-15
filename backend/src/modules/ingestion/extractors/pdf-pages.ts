import { PDFDocument } from 'pdf-lib'
import { AppError } from '../../../utils/AppError.js'

// Pages sent to the OCR model in one request
const PAGES_PER_REQUEST = 4
// What the parts may come to together: each holds its pages' fonts and pictures, so a
// picture every page shares is copied into every part
const MAX_PARTS_BYTES = 96 * 1024 * 1024

/** Pages in a PDF, before reading it with OCR (Free has a monthly page cap) */
export async function pdfPageCount(buffer: Buffer) {
  return (await PDFDocument.load(buffer, { ignoreEncryption: true })).getPageCount()
}

/** A few pages of a PDF as a PDF of their own */
export interface PdfPart {
  bytes: Buffer
  pages: number
}

/** The PDF cut into small PDFs of a few pages each, one per OCR request */
export async function splitPdf(buffer: Buffer): Promise<PdfPart[]> {
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const pageCount = source.getPageCount()
  const parts: PdfPart[] = []
  let total = 0
  for (let first = 0; first < pageCount; first += PAGES_PER_REQUEST) {
    const part = await PDFDocument.create()
    const indices = Array.from({ length: Math.min(PAGES_PER_REQUEST, pageCount - first) }, (_, i) => first + i)
    for (const page of await part.copyPages(source, indices)) part.addPage(page)
    const bytes = Buffer.from(await part.save())
    total += bytes.length
    if (total > MAX_PARTS_BYTES) throw new AppError('This PDF is too big to read as a scan. Try splitting it into smaller files.', 422, 'FILE_TOO_LARGE')
    parts.push({ bytes, pages: indices.length })
  }
  return parts
}
