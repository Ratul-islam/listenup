/**
 * Cleans extracted text into paragraphs ready for speech: fixes whitespace,
 * rejoins words hyphenated across lines and drops empty/noise lines.
 */
export function normalizeParagraphs(paragraphs: string[]) {
  return paragraphs
    .map((p) =>
      p
        .normalize('NFC')
        // control chars except newline/tab
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F­​﻿]/g, '')
        // "exam-\nple" -> "example" (Latin only; Bangla rarely hyphenates)
        .replace(/([A-Za-z])-\s*\n\s*([a-z])/g, '$1$2')
        .replace(/\s*\n\s*/g, ' ')
        .replace(/[ \t ]+/g, ' ')
        .trim(),
    )
    .filter((p) => p.length > 0 && /[\p{L}\p{N}]/u.test(p))
}

/** Splits plain text on blank lines into paragraphs */
export function splitParagraphs(text: string) {
  return text.replace(/\r\n?/g, '\n').split(/\n\s*\n+/)
}

/** Markdown → readable text (headings, emphasis, links, code fences, images) */
export function stripMarkdown(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^\s*([-*_]\s*){3,}$/gm, '')
}

/** Short preview for library cards */
export function makeExcerpt(paragraphs: string[], max = 160) {
  const text = paragraphs.join(' ')
  return text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, '')}…`
}
