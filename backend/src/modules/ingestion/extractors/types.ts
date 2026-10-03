export interface Extracted {
  title?: string
  author?: string
  paragraphs: string[]
  /** Text extraction is unusable (scan, legacy Bangla font); read with OCR instead */
  needsOcr?: boolean
}
