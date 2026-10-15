import { detectAll } from 'tinyld'

/** Languages ListenUp reads, each with voices */
export const LANGS = ['en', 'bn', 'hi', 'es', 'pt', 'fr', 'it', 'ja', 'zh', 'ur', 'id'] as const
export type Lang = (typeof LANGS)[number]

/** Languages written in Latin script, told apart by vocabulary rather than script */
const LATIN_LANGS = ['en', 'es', 'pt', 'fr', 'it', 'id'] as const
type LatinLang = (typeof LATIN_LANGS)[number]
/** Languages written with Chinese characters: Japanese mixes in kana, Mandarin doesn't */
type HanLang = 'ja' | 'zh'

/** Languages often typed in English letters ("ami tomake bhalobashi"), which their own voices should still read */
type TypedLang = 'bn' | 'hi' | 'ur'

/**
 * What a document's ambiguous scripts are read as: its text in Latin letters
 * (a Latin-script language, or Bangla, Hindi or Urdu typed in English
 * letters), and Japanese or Mandarin for its Chinese characters
 */
export interface ScriptLanguages {
  latin: LatinLang | TypedLang
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

// A real word, not a stray letter
const NATIVE_WORD_LETTERS = 2

/**
 * Languages whose voices all read English as well as their own script: Bangla
 * and Urdu voices are multilingual, and Hindi voices are the ones that read
 * Indian English. English beside their text is theirs to read, so one voice
 * carries a mixed passage instead of two taking turns.
 */
export const READS_ENGLISH: readonly Lang[] = ['bn', 'ur', 'hi']

/**
 * Language of one sentence, by script: Bengali is Bangla, Devanagari is Hindi,
 * Arabic script is Urdu, kana is Japanese, and Chinese characters alone are the
 * document's Han language. Latin script is the document's Latin-script language
 * (English, Spanish, Portuguese, French, Italian or Indonesian).
 *
 * A sentence with Bangla, Hindi or Urdu words in it is that language however
 * much English surrounds them ("আমি Google Chrome browser use করি"): their
 * voices say the English too, while an English voice can't read their script
 * at all and would drop the words.
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
  if (cjk / total >= 0.3 && cjk >= bn + hi + ur) return kana > 0 ? 'ja' : defaults.han
  const [native, letters] = ([['bn', bn], ['hi', hi], ['ur', ur]] as const).reduce((top, next) => (next[1] > top[1] ? next : top))
  if (letters >= NATIVE_WORD_LETTERS) return native
  if (cjk / total >= 0.3) return kana > 0 ? 'ja' : defaults.han
  return defaults.latin
}

/** Whether text has no letters but Latin ones: the only kind that can belong to another language's voice */
export const isLatinOnly = (text: string) => count(text, LATIN) > 0 && !count(text, BENGALI) && !count(text, DEVANAGARI) && !count(text, ARABIC) && !count(text, KANA) && !count(text, HAN)

// Enough text to tell English from another Latin-script language
const ENGLISH_PASSAGE_CHARS = 40
const ENGLISH_CONFIDENCE = 0.8

/**
 * Whether a paragraph in a Spanish (Portuguese, French…) document is English,
 * so an English voice reads it instead of the document's voice sounding it out
 * by its own language's rules. Only whole paragraphs, and only when it's clear:
 * a sentence is too short to tell the two apart reliably.
 */
export function isEnglishPassage(text: string, latin: ScriptLanguages['latin']) {
  if (!isLatinLang(latin) || latin === 'en' || text.length < ENGLISH_PASSAGE_CHARS || !isLatinOnly(text)) return false
  const [top] = detectAll(text, { only: ['en', latin] })
  return top?.lang === 'en' && top.accuracy >= ENGLISH_CONFIDENCE
}

// Everyday Bangla and Hindi words as they're typed in English letters. Words that are also
// common English or Indonesian words (she, age, din, tin, char, ma, pare, ache, ini, dan) are left out.
const TYPED_BANGLA = new Set(
  `ami amra amar amader amake tumi tomra tomar tomake tomader tui apni apnar apnake apnara shey tara tader eta ota eita oita keno kemon kothay kokhon kobe koto kono kichu kichhu keu shob sob shobai sobai
   ar ebong kintu tobe tai karon jodi tahole naki othoba theke jonno jonne shathe sathe shonge songe moto diye niye kache upor niche bhitore vitore baire ekhon tokhon jokhon ekhono tokhono abar aro khub onek ektu shudhu sudhu hoyto nai nei noy accha thik bhalo valo kharap boro choto chhoto notun purono shundor sundor halka
   achhe achi acho achen chilo chhilo chilam chhilam hobe hoy hoye hoyeche hoyechhe hocche holo korbo kori koro kore korchi korche korlam korlo korte korbe koren jabo jai jao jacchi jacche gelo gelam giye ashbo ashi asho ashe eshe bollo bolo boli bollam dekhi dekho dekhe dekhlo dekhlam jani jano janina pari paro parbo chai chao khai khabo kheye dilo dilam nilo thaki thake thakbo laglo mone
   aj ajke kal kalke raat shokal sokal dupur bikel shondha somoy shomoy bari basha ghor rasta manush chele meye baba bhai apu bondhu kaj kotha golpo pani bhat taka desh brishti akash ekta ekti ekjon dui duto pach eka dhonnobad`.split(/\s+/),
)
const TYPED_HINDI = new Set(
  `main mai mujhe mera meri mere hum hamara tum tumhara aap aapka yeh woh uska unka kya kyun kyon kaise kahan kab kaun kuch sab aur lekin magar phir toh bhi nahi nahin haan theek accha achha bahut thoda abhi yahan wahan
   hai hain tha thi hoga hogi raha rahi rahe karna karta karti kiya gaya gayi gaye aaya aayi liye diya dekha suna bola chahiye sakta sakti
   aaj kal raat subah shaam ghar kaam baat log dost paani khana paisa shukriya namaste`.split(/\s+/),
)
// Endings that give Bangla typed in English letters away: porchhilo, rastagulo, korechhe, jacchi
const TYPED_BANGLA_ENDING = /(?:chh?ilo|chh?ilam|echh?e|cch[ei]|gul[oi])$/
const TYPED_SHARE = 0.2
const TYPED_MIN_WORDS = 3

/**
 * Bangla or Hindi typed in English letters ("raat tokhon almost 11টা, ar halka
 * brishti porchhilo"), told by its everyday words. A language detector, asked
 * which Latin-script language it is, guesses Spanish or Portuguese; and filed
 * as English it's read by an English voice, as English words.
 */
export function typedInLatin(sample: string): 'bn' | 'hi' | null {
  const words = sample.toLowerCase().match(/[a-z']+/g) ?? []
  if (words.length < 6) return null
  const share = (isOne: (word: string) => boolean) => {
    const found = words.filter(isOne)
    return new Set(found).size >= TYPED_MIN_WORDS ? found.length / words.length : 0
  }
  const bn = share((w) => TYPED_BANGLA.has(w) || (w.length >= 7 && TYPED_BANGLA_ENDING.test(w)))
  const hi = share((w) => TYPED_HINDI.has(w))
  if (Math.max(bn, hi) < TYPED_SHARE) return null
  return bn >= hi ? 'bn' : 'hi'
}

/**
 * Whether a passage is written mostly in English letters, whatever language
 * it is. A part of a typed-Bangla story can be too short, or have too much
 * English in it, for typedInLatin() to tell on its own.
 */
export function inLatinLetters(text: string) {
  const letters = text.match(/\p{L}/gu) ?? []
  return letters.length > 0 && letters.filter((l) => /\p{Script=Latin}/u.test(l)).length / letters.length >= 0.7
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
 * What a whole document's text in Latin letters is read as. Sentences are too
 * short to tell Spanish from Portuguese (or Italian) reliably, so this looks at
 * a sample of all the Latin-script text at once. A language chosen at import
 * wins: a Latin-script one, or Bangla, Hindi or Urdu, whose voices then read
 * what's typed in English letters (and any English beside it) as well.
 */
export function detectLatinLanguage(paragraphs: string[], hint?: string | null): ScriptLanguages['latin'] {
  if (isLatinLang(hint)) return hint
  if (hint === 'bn' || hint === 'hi' || hint === 'ur') return hint
  let sample = ''
  for (const p of paragraphs) {
    const latinOnly = p.replace(/[^\sA-Za-zÀ-ÖØ-öø-ÿ'’.,;:!?¿¡-]/g, ' ').replace(/\s+/g, ' ').trim()
    if (latinOnly.length < 20) continue
    sample += `${latinOnly} `
    if (sample.length > 4000) break
  }
  if (sample.length < 20) return 'en'
  // Bangla or Hindi typed in English letters: their own voices read it, not an English (or, by a
  // detector's guess, Spanish) one
  const typed = typedInLatin(sample)
  if (typed) return typed
  const found = detectAll(sample, { only: [...LATIN_LANGS] })[0]?.lang
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
