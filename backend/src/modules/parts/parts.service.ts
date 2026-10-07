import { CHARS_PER_SECOND } from '../../config/constants.js'
import { Prisma, type DocumentChunk } from '../../generated/prisma/client.js'
import { AppError } from '../../utils/AppError.js'
import { toSummary } from '../documents/documents.service.js'
import { NO_EXPRESSIONS, normalizeExpressions, readExpressions, type ChunkExpressions, type EmotionMark, type SoundMark } from '../expressions/expression-catalog.js'
import { chunkParagraphs, type ChunkDraft } from '../ingestion/text/chunker.js'
import { documentScripts, isLang, type Lang } from '../ingestion/text/language.js'
import { lexiconFor } from '../pronunciations/lexicon-cache.js'
import { readSentenceTakes } from '../tts/render-plan.js'
import { readLock } from '../tts/tts.service.js'
import { findVoice } from '../voices/voice-catalog.js'
import type { VoicesService } from '../voices/voices.service.js'
import type { PartDraft, PartsRepository } from './parts.repository.js'
import type { EditPartBody, InsertPartBody, ReplaceBody } from './parts.schema.js'

const lockedError = () => new AppError('This part is locked. Unlock it to change how it sounds.', 423, 'PART_LOCKED')

/** Roughly how long text takes to say, for honest cost notes before anything is voiced */
const secondsFor = (chars: number, language: string) => Math.max(1, Math.round(chars / CHARS_PER_SECOND[isLang(language) ? language : 'en']))

/** "Hold" → "Brace", "HOLD" → "BRACE": a case-insensitive replacement keeps the found word's capitals */
function sameCase(found: string, replacement: string) {
  if (found.length > 1 && found === found.toUpperCase() && found !== found.toLowerCase()) return replacement.toUpperCase()
  const first = found.charAt(0)
  return first !== first.toLowerCase() ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// How much text after a sound is used to find its place again in edited text
const SOUND_ANCHOR_CHARS = 24

/** One part as the app shows it in the script editor and the player */
export function toPart(c: DocumentChunk) {
  return {
    index: c.index,
    text: c.text,
    language: c.language,
    sentences: c.sentences,
    expressions: readExpressions(c.expressions),
    take: c.take,
    /** Sentences redone on their own: sentence index → take */
    sentenceTakes: readSentenceTakes(c.sentenceTakes),
    /** The part's own voice (a character), or null for the script's voice */
    ownVoiceId: c.voiceId,
    pauseAfterMs: c.pauseAfterMs,
    locked: c.locked,
    estimatedMs: Math.round(c.estimatedDurationSec * 1000),
  }
}

const paragraphsOf = (text: string) =>
  text
    .split(/\n+/)
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)

/**
 * Keeps the emotions and sounds of edited text where their words still are.
 * Each mark looks for its words in the new parts, in order; marks whose words
 * were removed are dropped.
 */
function carryMarks(oldText: string, old: ChunkExpressions, drafts: ChunkDraft[]): ChunkExpressions[] {
  const out = drafts.map(() => ({ emotions: [] as EmotionMark[], sounds: [] as SoundMark[] }))
  const find = (words: string, from: { part: number; at: number }) => {
    for (let p = from.part; p < drafts.length; p++) {
      const at = drafts[p].text.indexOf(words, p === from.part ? from.at : 0)
      if (at >= 0) return { part: p, at }
    }
    return null
  }
  let cursor = { part: 0, at: 0 }
  for (const m of [...old.emotions].sort((a, b) => a.start - b.start)) {
    const words = oldText.slice(m.start, m.end).trim()
    const found = words && find(words, cursor)
    if (!found) continue
    out[found.part].emotions.push({ ...m, start: found.at, end: found.at + words.length })
    cursor = { part: found.part, at: found.at + words.length }
  }
  cursor = { part: 0, at: 0 }
  for (const s of [...old.sounds].sort((a, b) => a.at - b.at)) {
    const anchor = oldText.slice(s.at, s.at + SOUND_ANCHOR_CHARS).trimEnd()
    if (!anchor) {
      // A sound at the very end stays at the end
      const last = drafts.length - 1
      out[last].sounds.push({ ...s, at: drafts[last].text.length })
      continue
    }
    const found = find(anchor, cursor)
    if (!found) continue
    out[found.part].sounds.push({ ...s, at: found.at })
    cursor = found
  }
  return out.map((e, i) => normalizeExpressions(e, drafts[i].text.length))
}

/**
 * A script's parts, edited one at a time. Every part keeps its own cached
 * audio, so changing, adding, removing or re-taking one part voices only that
 * part again; the rest of the recording is reused for free.
 */
export class PartsService {
  constructor(
    private readonly partsRepository: PartsRepository,
    private readonly voicesService: VoicesService,
  ) {}

  private async readyDocument(userId: string, documentId: string) {
    const doc = await this.partsRepository.findOwned(userId, documentId)
    if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
    if (doc.status !== 'READY') throw new AppError('This document is still being prepared', 409, 'DOCUMENT_NOT_READY')
    return doc
  }

  private async part(documentId: string, index: number) {
    const chunk = await this.partsRepository.findPart(documentId, index)
    if (!chunk) throw new AppError('That part of the document does not exist', 404, 'CHUNK_NOT_FOUND')
    return chunk
  }

  /** New text split into parts the way imports are, in the document's languages */
  private draft(doc: { languageHint: string | null; language: string | null }, text: string) {
    const paragraphs = paragraphsOf(text)
    if (!paragraphs.length) throw new AppError("A part can't be empty. Delete it instead.", 400, 'EMPTY_PART')
    const hint = doc.languageHint ?? (isLang(doc.language) ? doc.language : null)
    return chunkParagraphs(paragraphs, documentScripts(paragraphs, hint), { shortFirst: false })
  }

  private async changed(documentId: string, from: number, count: number) {
    return (await this.partsRepository.listParts(documentId, from, count)).map(toPart)
  }

  /**
   * Changes a part's words and/or its emotions. Longer text becomes several
   * parts; the parts after it move along, with the listener's place and bookmarks.
   */
  async edit(userId: string, documentId: string, index: number, { text, expressions, voiceId, pauseAfterMs, locked }: EditPartBody) {
    const doc = await this.readyDocument(userId, documentId)
    let chunk = await this.part(documentId, index)
    const changesSound = (text !== undefined && text !== chunk.text) || expressions !== undefined || (voiceId !== undefined && voiceId !== chunk.voiceId)
    if (chunk.locked && locked !== false && changesSound) throw lockedError()

    const settings = await this.settings(userId, doc, chunk, { voiceId, pauseAfterMs, locked })
    if (Object.keys(settings).length) chunk = await this.partsRepository.updatePart(chunk.id, settings)

    if (text === undefined && expressions === undefined) {
      return { document: toSummary(await this.partsRepository.markEdited(documentId)), parts: [toPart(chunk)] }
    }
    if (text === undefined || text === chunk.text) {
      const marks = normalizeExpressions(expressions ?? readExpressions(chunk.expressions), chunk.text.length)
      await this.partsRepository.setExpressions(chunk.id, marks)
      return { document: toSummary(await this.partsRepository.markEdited(documentId)), parts: await this.changed(documentId, index, 1) }
    }

    const drafts = this.draft(doc, text)
    // Marks sent with the text are for the new text (one part); otherwise the old ones follow their words
    const marks =
      expressions && drafts.length === 1
        ? [normalizeExpressions(expressions, drafts[0].text.length)]
        : carryMarks(chunk.text, readExpressions(chunk.expressions), drafts)
    // A split part keeps its voice in every piece, and its pause after the last
    const parts: PartDraft[] = drafts.map((d, i) => ({
      ...d,
      expressions: marks[i] ?? NO_EXPRESSIONS,
      narration: chunk.narration,
      voiceId: chunk.voiceId,
      pauseAfterMs: i === drafts.length - 1 ? chunk.pauseAfterMs : 0,
    }))
    const saved = await this.partsRepository.replacePart(documentId, chunk.id, index, parts)
    return { document: toSummary(saved), parts: await this.changed(documentId, index, parts.length) }
  }

  /** New text after a part (or at the start), voiced only when it's played or exported */
  async insert(userId: string, documentId: string, { after, text }: InsertPartBody) {
    const doc = await this.readyDocument(userId, documentId)
    const count = await this.partsRepository.countParts(documentId)
    const at = Math.min(after + 1, count)
    // Takes the narration of the part it follows, so a styled story stays styled
    const neighbour = await this.partsRepository.findPart(documentId, Math.max(at - 1, 0))
    const parts: PartDraft[] = this.draft(doc, text).map((d) => ({ ...d, expressions: NO_EXPRESSIONS, narration: neighbour?.narration ?? null }))
    const saved = await this.partsRepository.insertParts(documentId, at, parts)
    return { document: toSummary(saved), parts: await this.changed(documentId, at, parts.length) }
  }

  /**
   * A part's own voice, the pause after it, and its lock. Locking keeps the part
   * as it sounds now: its pronunciations are copied, and its voice is pinned
   * unless it already has its own.
   */
  private async settings(
    userId: string,
    doc: Awaited<ReturnType<PartsService['readyDocument']>>,
    chunk: DocumentChunk,
    { voiceId, pauseAfterMs, locked }: Pick<EditPartBody, 'voiceId' | 'pauseAfterMs' | 'locked'>,
  ) {
    const data: Prisma.DocumentChunkUncheckedUpdateInput = {}
    if (voiceId !== undefined && voiceId !== chunk.voiceId) {
      if (voiceId && findVoice(voiceId)?.language !== chunk.language) throw new AppError('That voice doesn’t speak this part’s language', 400, 'INVALID_VOICE')
      data.voiceId = voiceId
    }
    if (pauseAfterMs !== undefined) data.pauseAfterMs = pauseAfterMs
    if (locked === true && !chunk.locked) {
      const own = (data.voiceId as string | null | undefined) ?? chunk.voiceId
      const pinned = own ? undefined : this.voicesService.resolve(doc.playback[0]?.voiceId, chunk.language as Lang, await this.voicesService.getPreferences(userId)).id
      data.locked = true
      data.lockedLexicon = { rules: (await lexiconFor(userId)).rules, ...(pinned && { pinnedVoice: pinned }) } as unknown as Prisma.InputJsonValue
      if (pinned) data.voiceId = pinned
    }
    if (locked === false && chunk.locked) {
      const lock = readLock(chunk.lockedLexicon)
      data.locked = false
      data.lockedLexicon = Prisma.DbNull
      // A voice only the lock pinned goes back to following the script
      if (lock?.pinnedVoice && chunk.voiceId === lock.pinnedVoice && voiceId === undefined) data.voiceId = null
    }
    return data
  }

  async remove(userId: string, documentId: string, index: number) {
    await this.readyDocument(userId, documentId)
    const chunk = await this.part(documentId, index)
    if (chunk.locked) throw lockedError()
    if ((await this.partsRepository.countParts(documentId)) <= 1) {
      throw new AppError("This is the only part left. Edit it, or delete the whole script.", 400, 'LAST_PART')
    }
    const saved = await this.partsRepository.deletePart(documentId, chunk.id, index)
    return { document: toSummary(saved) }
  }

  /**
   * "New take": the same words recorded again, for when a line came out
   * wrong. Only this part is voiced again (when it's next played or exported),
   * and it counts like any new audio.
   */
  async retake(userId: string, documentId: string, index: number) {
    await this.readyDocument(userId, documentId)
    const chunk = await this.part(documentId, index)
    if (chunk.locked) throw lockedError()
    const saved = await this.partsRepository.newTake(chunk.id)
    return { parts: [toPart(saved)], secondsToVoice: secondsFor(chunk.text.length, chunk.language) }
  }

  /**
   * "Redo this sentence": only that sentence is recorded again, on its own,
   * and spliced into the part's recording, so a slip costs a few seconds rather
   * than the part or the whole script. It's voiced the next time the part plays
   * or is exported.
   */
  async retakeSentence(userId: string, documentId: string, index: number, sentence: number) {
    await this.readyDocument(userId, documentId)
    const chunk = await this.part(documentId, index)
    if (chunk.locked) throw lockedError()
    const span = (chunk.sentences as unknown as { start: number; end: number }[])[sentence]
    if (!span || !chunk.text.slice(span.start, span.end).trim()) throw new AppError('That sentence does not exist', 404, 'SENTENCE_NOT_FOUND')
    const takes = readSentenceTakes(chunk.sentenceTakes)
    takes[sentence] = (takes[sentence] ?? 0) + 1
    const saved = await this.partsRepository.setSentenceTakes(chunk.id, takes)
    return { parts: [toPart(saved)], secondsToVoice: secondsFor(span.end - span.start, chunk.language) }
  }

  /**
   * Find and replace across a script. First call it without `apply` to see how
   * many parts change and roughly what voicing them costs; locked parts are
   * left alone and listed.
   */
  async replace(userId: string, documentId: string, { find, replace, matchCase, wholeWord, apply }: ReplaceBody) {
    await this.readyDocument(userId, documentId)
    const body = escapeRegExp(find.trim())
    if (!body) throw new AppError('Type what to find', 400, 'EMPTY_FIND')
    const pattern = new RegExp(wholeWord ? `(?<![\\p{L}\\p{M}\\p{N}])${body}(?![\\p{L}\\p{M}\\p{N}])` : body, matchCase ? 'gu' : 'giu')
    const hits = (await this.partsRepository.listAll(documentId))
      .map((chunk) => ({ chunk, count: chunk.text.match(pattern)?.length ?? 0, next: chunk.text.replace(pattern, (found) => (matchCase ? replace : sameCase(found, replace))) }))
      .filter((h) => h.count > 0)
    const changing = hits.filter((h) => !h.chunk.locked && h.next.trim())
    const summary = {
      matches: hits.reduce((n, h) => n + h.count, 0),
      parts: changing.map((h) => h.chunk.index),
      lockedParts: hits.filter((h) => h.chunk.locked).map((h) => h.chunk.index),
      secondsToVoice: changing.reduce((n, h) => n + secondsFor(h.next.length, h.chunk.language), 0),
    }
    if (!apply || !changing.length) return summary
    // Last part first, so a part that grows into several doesn't move the ones still to change
    let document = null
    for (const h of [...changing].sort((a, b) => b.chunk.index - a.chunk.index)) {
      document = (await this.edit(userId, documentId, h.chunk.index, { text: h.next })).document
    }
    return { ...summary, document }
  }
}
