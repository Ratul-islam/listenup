import mammoth from 'mammoth'
import { splitParagraphs } from '../text/normalize.js'
import type { Extracted } from './types.js'

export async function extractDocx(buffer: Buffer): Promise<Extracted> {
  const { value } = await mammoth.extractRawText({ buffer })
  return { paragraphs: splitParagraphs(value) }
}
