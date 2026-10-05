/**
 * Removes what sounds wrong read aloud: citation markers, footnote numbers,
 * bare links, page numbers, table-of-contents lines and a trailing reference
 * list. Listeners can switch this off per document ("Read everything").
 */

// A references heading counts only in the last part of a document, so a chapter called "Notes" survives
const REFERENCES_FROM = 0.7
const REFERENCES_HEADING =
  /^(references|bibliography|works cited|sources|literature cited|তথ্যসূত্র|গ্রন্থপঞ্জি|সহায়ক গ্রন্থ|संदर्भ|सन्दर्भ|ग्रंथ सूची|referencias|bibliografía|références|bibliographie|referências|bibliografia|riferimenti bibliografici|riferimenti|参考文献|参考资料|حوالہ جات|کتابیات|daftar pustaka|referensi)\s*[:：]?$/i

const PAGE_NUMBER = /^(page\s+|p\.\s*|পৃষ্ঠা\s*|पृष्ठ\s*)?[\d০-৯०-९]{1,4}(\s*(of|\/)\s*[\d০-৯०-९]{1,4})?$/i
// "Chapter 2 ........ 37"
const TOC_LINE = /\S.{0,120}?(\.{4,}|…{2,}|\s·\s·\s)\s*[\d০-৯०-९ivxlc]{1,5}$/i

const INLINE: [RegExp, string][] = [
  // [12], [3, 7], [4–9], also in Bangla and Hindi digits
  [/\s?\[[\d০-৯०-९]{1,3}(?:\s*[-–,]\s*[\d০-৯०-९]{1,3})*\]/g, ''],
  // (Smith, 2020), (Smith et al., 2020; Doe & Roe 2019a)
  [/\s?\((?:see\s)?(?:[\p{Lu}][\p{L}'’-]+(?:\s(?:et al\.?|and|&|y|e|et)\s?(?:[\p{Lu}][\p{L}'’-]+)?)?,?\s(?:19|20)\d{2}[a-z]?(?:,\s?p+\.\s?\d+(?:[-–]\d+)?)?(?:;\s?)?)+\)/gu, ''],
  // Superscript footnote numbers
  [/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, ''],
  // DOIs, and links in brackets
  [/\s?\(?(?:doi:\s?|https?:\/\/doi\.org\/)10\.\d{4,9}\/\S+?\)?(?=[\s,;]|[.!?](?:\s|$)|$)/gi, ''],
  [/\s?\((?:https?:\/\/|www\.)[^\s)]+\)/gi, ''],
]

// A link in running text is read as its site's name: "see example.com for details"
const BARE_LINK = /(?:https?:\/\/|www\.)[^\s]+?(?=[\s,;)]|[.!?](?:\s|$)|$)/gi
const siteName = (url: string) => {
  try {
    return new URL(url.startsWith('www.') ? `https://${url}` : url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function cleanInline(paragraph: string) {
  let text = paragraph
  for (const [pattern, replacement] of INLINE) text = text.replace(pattern, replacement)
  text = text.replace(BARE_LINK, siteName)
  return text
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:!?।])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function removeClutter(paragraphs: string[]) {
  let kept = paragraphs
  const cutAt = kept.findIndex((p, i) => i >= kept.length * REFERENCES_FROM && REFERENCES_HEADING.test(p.trim()))
  if (cutAt > 0) kept = kept.slice(0, cutAt)

  return kept
    .filter((p) => !PAGE_NUMBER.test(p.trim()) && !TOC_LINE.test(p.trim()))
    .map(cleanInline)
    .filter((p) => /[\p{L}\p{N}]/u.test(p))
}
