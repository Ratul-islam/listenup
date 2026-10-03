import { PDFDocument } from 'pdf-lib'
import { env } from '../../../config/env.js'
import { chatCompletion } from '../../../lib/openrouter.js'
import { splitParagraphs } from '../text/normalize.js'
import type { Extracted } from './types.js'

const PAGES_PER_REQUEST = 4

const SYSTEM = `You transcribe documents for a text-to-speech app.
Return only the readable body text, exactly as written, in its original language (Bangla stays Bangla, in Unicode).
Separate paragraphs with a blank line. Join lines broken mid-sentence.
Leave out page numbers, running headers/footers, and image descriptions. Do not add commentary or Markdown.`

/** Image → text with a vision model */
export async function ocrImage(buffer: Buffer, mimeType: string): Promise<Extracted> {
  const text = await chatCompletion({
    model: env.OPENROUTER_OCR_MODEL,
    system: SYSTEM,
    content: [
      { type: 'text', text: 'Transcribe this page.' },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` } },
    ],
    maxTokens: 8000,
  })
  return { paragraphs: splitParagraphs(text) }
}

/** Scanned or legacy-font PDF → text, a few pages per request to stay within output limits */
export async function ocrPdf(buffer: Buffer): Promise<Extracted> {
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const pageCount = source.getPageCount()
  const paragraphs: string[] = []

  for (let first = 0; first < pageCount; first += PAGES_PER_REQUEST) {
    const part = await PDFDocument.create()
    const indices = Array.from({ length: Math.min(PAGES_PER_REQUEST, pageCount - first) }, (_, i) => first + i)
    for (const page of await part.copyPages(source, indices)) part.addPage(page)
    const bytes = Buffer.from(await part.save())

    const text = await chatCompletion({
      model: env.OPENROUTER_OCR_MODEL,
      system: SYSTEM,
      pdfEngine: 'native',
      content: [
        { type: 'text', text: `Transcribe these ${indices.length} page(s) in order.` },
        { type: 'file', file: { filename: 'pages.pdf', file_data: `data:application/pdf;base64,${bytes.toString('base64')}` } },
      ],
      maxTokens: 16000,
    })
    paragraphs.push(...splitParagraphs(text))
  }
  return { paragraphs }
}
