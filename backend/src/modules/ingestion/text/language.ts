import { detect } from 'tinyld'

/** Languages ListenUp reads, each with voices */
export const LANGS = ['en', 'bn', 'hi', 'es', 'pt', 'fr', 'it', 'ja', 'zh', 'ur', 'id'] as const
export type Lang = (typeof LANGS)[number]

/** Languages written in Latin script, told apart by vocabulary rather than script */
const LATIN_LANGS = ['en', 'es', 'pt', 'fr', 'it', 'id'] as const
type LatinLang = (typeof LATIN_LANGS)[number]
/** Languages written with Chinese characters: Japanese mixes in kana, Mandarin doesn't */
type HanLang = 'ja' | 'zh'

/** What a document's ambiguous scripts are read as: its Latin-script language, and Japanese or Mandarin */
export interface ScriptLanguages {
  latin: LatinLang
  han: HanLang
}

export const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang)
const isLatinLang = (value: unknown): value is LatinLang => LATIN_LANGS.includes(value as LatinLang)

const BENGALI = /[ঀ-৿]/g
const DEVANAGARI = /[ऀ-ॿ]/g
// Arabic script, as Urdu writes it (Arabic and Persian aren't read yet)
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g
const KANA = /[\u3040-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/g
const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g
const LATIN = /[A-Za-zÀ-ÖØ-öø-ÿ]/g

const count = (text: string, script: RegExp) => text.match(script)?.length ?? 0

/**
 * Language of one sentence, by script: Bengali is Bangla, Devanagari is Hindi,
 * Arabic script is Urdu, kana is Japanese, and Chinese characters alone are the
 * document's Han language. Latin script is the document's Latin-script language
 * (English, Spanish, Portuguese, French, Italian or Indonesian).
 */
export function detectLanguage(text: string, defaults: ScriptLanguages = { latin: 'en', han: 'zh' }): Lang {
  const bn = count(text, BENGALI)
  const hi = count(text, DEVANAGARI)
  const ur = count(text, ARABIC)
  const kana = count(text, KANA)
  const han = count(text, HAN)
  const la = count(text, LATIN)
  // Chinese characters carry a word each, so they weigh more than letters
  const cjk = (kana + han) * 3
  const total = bn + hi + ur + cjk + la
  if (total === 0) return defaults.latin
  if (bn / total >= 0.3 && bn >= hi) return 'bn'
  if (hi / total >= 0.3) return 'hi'
  if (ur / total >= 0.3) return 'ur'
  if (cjk / total >= 0.3) return kana > 0 ? 'ja' : defaults.han
  return defaults.latin
}

/**
 * Whether a document's Chinese characters are Japanese or Mandarin: Japanese
 * text always has some kana. A Japanese or Mandarin hint chosen at import wins.
 */
function detectHanLanguage(paragraphs: string[], hint?: string | null): HanLang {
  if (hint === 'ja' || hint === 'zh') return hint
  let kana = 0
  let han = 0
  for (const p of paragraphs) {
    kana += count(p, KANA)
    han += count(p, HAN)
    if (kana + han > 4000) break
  }
  return han > 0 && kana / (kana + han) >= 0.05 ? 'ja' : 'zh'
}

/** How a document's Latin-script text and Chinese characters should be read */
export const documentScripts = (paragraphs: string[], hint?: string | null): ScriptLanguages => ({
  latin: detectLatinLanguage(paragraphs, hint),
  han: detectHanLanguage(paragraphs, hint),
})

/**
 * The Latin-script language of a whole document. Sentences are too short to
 * tell Spanish from Portuguese (or Italian) reliably, so this looks at a sample of all the
 * Latin-script text at once. A Latin-script hint chosen at import wins.
 */
export function detectLatinLanguage(paragraphs: string[], hint?: string | null): LatinLang {
  if (isLatinLang(hint)) return hint
  let sample = ''
  for (const p of paragraphs) {
    const latinOnly = p.replace(/[^\sA-Za-zÀ-ÖØ-öø-ÿ'’.,;:!?¿¡-]/g, ' ').replace(/\s+/g, ' ').trim()
    if (latinOnly.length < 20) continue
    sample += `${latinOnly} `
    if (sample.length > 4000) break
  }
  if (sample.length < 20) return 'en'
  const found = detect(sample, { only: [...LATIN_LANGS] })
  return isLatinLang(found) ? found : 'en'
}

/** The document's main language, or "mixed" when no language makes up 85% of the text */
export function documentLanguage(chunks: { language: Lang; text: string }[]) {
  const share = new Map<Lang, number>()
  let total = 0
  for (const c of chunks) {
    share.set(c.language, (share.get(c.language) ?? 0) + c.text.length)
    total += c.text.length
  }
  const [top, chars] = [...share.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['en', 0]
  return total && chars / total > 0.85 ? top : 'mixed'
}
