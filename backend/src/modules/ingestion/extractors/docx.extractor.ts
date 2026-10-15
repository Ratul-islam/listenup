import mammoth from 'mammoth'
import { openZip } from '../../../lib/zip.js'
import { splitParagraphs } from '../text/normalize.js'
import type { Extracted } from './types.js'

// mammoth unpacks with JSZip, which trusts the sizes the file claims: the whole file is
// unpacked once here with real ceilings first, so a small file can't unpack to gigabytes
const DOCX_LIMITS = { maxEntries: 10_000, maxEntryBytes: 24 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 }

export async function extractDocx(buffer: Buffer): Promise<Extracted> {
  await openZip(buffer, DOCX_LIMITS).checkAll()
  const { value } = await mammoth.extractRawText({ buffer })
  return { paragraphs: splitParagraphs(value) }
}
