export type Lang = 'en' | 'bn'

const BENGALI = /[ঀ-৿]/g
const LATIN = /[A-Za-z]/g

/** Bangla if Bengali script makes up a meaningful share of the letters */
export function detectLanguage(text: string): Lang {
  const bn = text.match(BENGALI)?.length ?? 0
  const en = text.match(LATIN)?.length ?? 0
  if (bn === 0) return 'en'
  return bn / (bn + en) >= 0.3 ? 'bn' : 'en'
}

export function documentLanguage(chunks: { language: Lang; text: string }[]) {
  let bn = 0
  let en = 0
  for (const c of chunks) {
    if (c.language === 'bn') bn += c.text.length
    else en += c.text.length
  }
  const total = bn + en || 1
  if (bn / total > 0.85) return 'bn'
  if (en / total > 0.85) return 'en'
  return 'mixed'
}
