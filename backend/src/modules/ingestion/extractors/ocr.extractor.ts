import { env } from '../../../config/env.js'
import { chatCompletion } from '../../../lib/openrouter.js'
import { splitParagraphs } from '../text/normalize.js'
import type { PdfPart } from './pdf-pages.js'
import type { Extracted } from './types.js'

const SYSTEM = `You transcribe documents for a text-to-speech app.
Return only the readable body text, exactly as written, in its original language (Bangla stays Bangla, in Unicode).
Separate paragraphs with a blank line. Join lines broken mid-sentence.
Leave out page numbers, running headers/footers, and image descriptions. Do not add commentary or Markdown.`

/** Image → text with a vision model */
export async function ocrImage(buffer: Buffer, mimeType: string, userId: string): Promise<Extracted> {
  const text = await chatCompletion({
    model: env.OPENROUTER_OCR_MODEL,
    userId,
    system: SYSTEM,
    content: [
      { type: 'text', text: 'Transcribe this page.' },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` } },
    ],
    maxTokens: 8000,
  })
  return { paragraphs: splitParagraphs(text) }
}

/** A scanned or legacy-font PDF, already cut into parts of a few pages (splitPdf, run by pdf-process.ts) → text */
export async function ocrPdf(parts: PdfPart[], userId: string): Promise<Extracted> {
  const paragraphs: string[] = []

  for (const { bytes, pages } of parts) {
    const text = await chatCompletion({
      model: env.OPENROUTER_OCR_MODEL,
      userId,
      system: SYSTEM,
      pdfEngine: 'native',
      content: [
        { type: 'text', text: `Transcribe these ${pages} page(s) in order.` },
        { type: 'file', file: { filename: 'pages.pdf', file_data: `data:application/pdf;base64,${bytes.toString('base64')}` } },
      ],
      maxTokens: 16000,
    })
    paragraphs.push(...splitParagraphs(text))
  }
  return { paragraphs }
}
