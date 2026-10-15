/**
 * Gives parts of documents imported before 11 October 2026 the language they'd
 * get today, so mixed text is read by one voice that can read all of it:
 *
 * - A part with Bangla, Hindi or Urdu words that was filed as English (it had
 *   more English letters) goes to that language. Its English voice couldn't
 *   read those words at all.
 * - English sentences that share a part with them stay with that voice.
 * - A document that's Bangla or Hindi typed in English letters ("raat tokhon
 *   almost 11টা"), or was imported as Bangla, Hindi or Urdu, has its parts in
 *   English letters read by that language's voice, not an English one.
 *
 * Only labels change: no text, no part boundaries, no bookmarks or places.
 * Relabelled parts are voiced again, by their new voice, the next time they're
 * played. Published writings and listeners' copies of them are left alone.
 * Shows what it would do unless --apply is given:
 *
 *   pnpm text:relabel-languages                (dry run)
 *   pnpm text:relabel-languages --apply
 *   pnpm text:relabel-languages --document <id>
 */
import { CHARS_PER_SECOND } from '../config/constants.js'
import { prisma } from '../config/db.js'
import { detectLanguage, detectLatinLanguage, documentLanguage, isLang, isLatinOnly, READS_ENGLISH, type Lang } from '../modules/ingestion/text/language.js'

const apply = process.argv.includes('--apply')
const only = process.argv.includes('--document') ? process.argv[process.argv.indexOf('--document') + 1] : undefined
const BATCH = 20
// How much of a part must be in a language for its voice to read the part's English too (as at import)
const OWN_SHARE = 1 / 3

/**
 * The language a part would be read in today, or null to leave it as it is.
 * `typed` is the language the document's English letters are (Bangla typed in
 * them, say), when they aren't a Latin-script language.
 */
function languageNow(text: string, sentences: { start: number; end: number }[], current: Lang, typed: Lang | null): Lang | null {
  const spans = sentences.length ? sentences : [{ start: 0, end: text.length }]
  // In a document typed in English letters, every part that has no other language's script is its language
  if (typed) {
    const others = spans.map((s) => text.slice(s.start, s.end)).filter((s) => !isLatinOnly(s) && detectLanguage(s) !== typed)
    if (!others.length) return typed === current ? null : typed
  }
  const share = new Map<Lang, number>()
  let english = 0
  for (const s of spans) {
    const sentence = text.slice(s.start, s.end)
    if (isLatinOnly(sentence)) english += sentence.length
    else {
      const language = detectLanguage(sentence)
      share.set(language, (share.get(language) ?? 0) + sentence.length)
    }
  }
  const [top, chars] = [...share.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
  if (!top || top === current || !READS_ENGLISH.includes(top)) return null
  // Every sentence with its script is its own; it takes the part's English too when enough of the part is
  const total = english + [...share.values()].reduce((n, c) => n + c, 0)
  return english === 0 || (chars ?? 0) >= total * OWN_SHARE ? top : null
}

let cursor: string | undefined
let documents = 0
let changedDocuments = 0
let relabelled = 0
const moves = new Map<string, number>()
const examples: string[] = []
for (;;) {
  const docs = await prisma.document.findMany({
    where: { status: 'READY', publicationId: null, masterOf: null, ...(only && { id: only }) },
    orderBy: { id: 'asc' },
    take: BATCH,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    select: { id: true, title: true, language: true, languageHint: true },
  })
  if (!docs.length) break
  for (const doc of docs) {
    documents++
    const chunks = await prisma.documentChunk.findMany({ where: { documentId: doc.id }, orderBy: { index: 'asc' }, select: { id: true, text: true, language: true, sentences: true } })
    const changes: { id: string; language: Lang; estimatedDurationSec: number }[] = []
    const latin = detectLatinLanguage(chunks.map((c) => c.text), doc.languageHint)
    const typed = READS_ENGLISH.includes(latin) ? latin : null
    const labelled = chunks.map((c) => {
      const current = (isLang(c.language) ? c.language : 'en') as Lang
      const next = languageNow(c.text, (c.sentences as unknown as { start: number; end: number }[]) ?? [], current, typed)
      if (next) {
        changes.push({ id: c.id, language: next, estimatedDurationSec: c.text.length / CHARS_PER_SECOND[next] })
        moves.set(`${current} → ${next}`, (moves.get(`${current} → ${next}`) ?? 0) + 1)
        if (examples.length < 6) examples.push(`${current} → ${next}  "${c.text.slice(0, 70).replace(/\s+/g, ' ')}"`)
      }
      return { language: next ?? current, text: c.text }
    })
    if (!changes.length) continue
    changedDocuments++
    relabelled += changes.length
    const language = documentLanguage(labelled)
    console.log(`  ${doc.title.slice(0, 40).padEnd(40)} ${String(changes.length).padStart(4)} of ${chunks.length} parts${language !== doc.language ? `, document ${doc.language ?? 'unset'} → ${language}` : ''}`)
    if (!apply) continue
    await prisma.$transaction([
      ...changes.map((c) => prisma.documentChunk.update({ where: { id: c.id }, data: { language: c.language, estimatedDurationSec: c.estimatedDurationSec } })),
      prisma.document.update({ where: { id: doc.id }, data: { language } }),
    ])
  }
  cursor = docs[docs.length - 1].id
  if (only) break
}

console.log(`\n${documents} documents looked at; ${relabelled} parts in ${changedDocuments} documents ${apply ? 'relabelled' : 'would be relabelled'}`)
for (const [move, count] of moves) console.log(`  ${move}: ${count}`)
if (examples.length) console.log(`\nFor example:\n${examples.map((e) => `  ${e}`).join('\n')}`)
if (!apply && relabelled) console.log('\nNothing was changed. Run again with --apply to relabel them.')
await prisma.$disconnect()
