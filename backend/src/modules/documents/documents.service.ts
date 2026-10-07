import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { ALLOWED_UPLOADS } from '../../config/constants.js'
import { Prisma, type Document, type DocumentChunk, type PlaybackState } from '../../generated/prisma/client.js'
import { hasLiveJob, queue, QUEUES, startQueue, type ProcessDocumentJob, type TranslateDocumentJob } from '../../lib/queue.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { UNTITLED } from '../ingestion/ingestion.service.js'
import { LANGS, type Lang } from '../ingestion/text/language.js'
import { readExpressions } from '../expressions/expression-catalog.js'
import { readSentenceTakes } from '../tts/render-plan.js'
import { planFor } from '../tts/tts.service.js'
import type { UsageService } from '../usage/usage.service.js'
import type { VoiceDefinition } from '../voices/voice-catalog.js'
import type { VoicesService } from '../voices/voices.service.js'
import { env } from '../../config/env.js'
import { CATEGORY_KINDS, type DocumentsRepository } from './documents.repository.js'
import { chatCompletion } from '../../lib/openrouter.js'
import { lexiconFor } from '../pronunciations/lexicon-cache.js'
import type { CreateBody, DigestBody, ListQuery, TextBody, TranslateBody, UpdateBody, UploadCompleteBody, UploadStartBody, UrlBody } from './documents.schema.js'

type WithPlayback = Document & { playback?: PlaybackState[] }

/** Client-facing document card data */
export function toSummary(doc: WithPlayback) {
  const state = doc.playback?.[0]
  const fraction = state?.completedAt ? 1 : state && doc.chunkCount ? Math.min(state.chunkIndex / doc.chunkCount, 1) : 0
  return {
    id: doc.id,
    title: doc.title,
    author: doc.author,
    kind: doc.kind,
    status: doc.status,
    error: doc.error,
    folderId: doc.folderId,
    sourceUrl: doc.sourceUrl,
    fileName: doc.fileName,
    language: doc.language,
    excerpt: doc.excerpt,
    charCount: doc.charCount,
    chunkCount: doc.chunkCount,
    estimatedDurationSec: doc.estimatedDurationSec,
    usedOcr: doc.usedOcr,
    keepClutter: doc.keepClutter,
    translatedFromId: doc.translatedFromId,
    /** A creator's script, kept in Studio */
    isScript: doc.isScript,
    /** When a part was last edited; reading the source again would undo edits */
    editedAt: doc.editedAt,
    /** Seconds of new audio this document has used from its owner's minutes */
    voicedSec: doc.voicedSec,
    inPodcast: doc.podcastAddedAt != null,
    autoExpression: doc.autoExpression,
    narration: {
      style: doc.narrationStyle,
      strength: doc.narrationStrength,
      // What "Make it expressive" detected, when the style is "auto"
      detected: (doc.narrationBrief as { style?: string } | null)?.style ?? null,
    },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    progress: state
      ? {
          chunkIndex: state.chunkIndex,
          offsetMs: state.offsetMs,
          voiceId: state.voiceId,
          speed: state.speed,
          fraction,
          completedAt: state.completedAt,
          updatedAt: state.updatedAt,
        }
      : null,
  }
}

const sourceKey = (userId: string, documentId: string, ext: string) => `documents/${userId}/${documentId}/source.${ext}`

const UPLOAD_LINK_TTL_SECONDS = 15 * 60
// How long a fresh "Make it expressive" request has to get its job queued
const AUTO_EXPRESSION_GRACE_MS = 60_000

const languageHint = (language?: string) => (language && language !== 'auto' ? language : null)

const DIGEST_ITEMS = 5
const DIGEST_CHARS_PER_ITEM = 6000
const DIGEST_LOOKBACK_MS = 14 * 24 * 60 * 60_000
const DIGEST_LANGUAGES: Record<Lang, string> = {
  en: 'English',
  bn: 'Bangla (Bengali)',
  hi: 'Hindi',
  es: 'Spanish',
  pt: 'Brazilian Portuguese',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  zh: 'Mandarin Chinese (Simplified characters)',
  ur: 'Urdu',
  id: 'Indonesian',
}
const DIGEST_TITLES: Record<Lang, string> = {
  en: "Today's digest",
  bn: 'আজকের সারসংক্ষেপ',
  hi: 'आज का सार',
  es: 'Resumen de hoy',
  pt: 'Resumo de hoje',
  fr: 'Le résumé du jour',
  it: 'Il riepilogo di oggi',
  ja: '今日のダイジェスト',
  zh: '今日摘要',
  ur: 'آج کا خلاصہ',
  id: 'Ringkasan hari ini',
}

// For titles of translations ("Notes · Español")
const LANGUAGE_LABELS: Record<Lang, string> = {
  en: 'English',
  bn: 'বাংলা',
  hi: 'हिन्दी',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  zh: '中文',
  ur: 'اردو',
  id: 'Bahasa Indonesia',
}

/** Extension and kind of an upload, by file name */
function uploadType(fileName: string) {
  const ext = path.extname(fileName).slice(1).toLowerCase()
  const type = ALLOWED_UPLOADS[ext]
  if (!type) {
    throw new AppError("That file type isn't supported yet. Try PDF, Word, ePub, text or a photo.", 415, 'UNSUPPORTED_FILE')
  }
  return { ext, ...type }
}

export class DocumentsService {
  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly voicesService: VoicesService,
    private readonly usageService: UsageService,
  ) {}

  private async enqueue(job: ProcessDocumentJob) {
    await startQueue()
    await queue.send(QUEUES.processDocument, job)
  }

  private async owned(userId: string, id: string) {
    const doc = await this.documentsRepository.findOwned(userId, id)
    if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
    return doc
  }

  async list(userId: string, query: ListQuery) {
    const [docs, counts] = await Promise.all([
      this.documentsRepository.list(userId, query),
      this.documentsRepository.countByKind(userId, query.view === 'scripts'),
    ])
    const byKind = Object.fromEntries(counts.map((c) => [c.kind, c._count._all])) as Record<string, number>
    const sum = (kinds: string[]) => kinds.reduce((n, k) => n + (byKind[k] ?? 0), 0)

    let items = docs.map(toSummary)
    if (query.sort === 'progress') {
      items = items.sort((a, b) => (b.progress?.updatedAt?.getTime() ?? 0) - (a.progress?.updatedAt?.getTime() ?? 0))
    }
    return {
      items,
      counts: {
        all: Object.values(byKind).reduce((a, b) => a + b, 0),
        books: sum(CATEGORY_KINDS.books),
        articles: sum(CATEGORY_KINDS.articles),
        notes: sum(CATEGORY_KINDS.notes),
        scans: sum(CATEGORY_KINDS.scans),
      },
    }
  }

  async get(userId: string, id: string) {
    const doc = await this.owned(userId, id)
    // The app polls this while "Make it expressive" runs. If the job is gone (its
    // process restarted and it ran out of retries), say so instead of spinning forever.
    // A just-started request gets a moment for its job to be queued.
    if (doc.autoExpression === 'RUNNING' && Date.now() - doc.updatedAt.getTime() > AUTO_EXPRESSION_GRACE_MS && !(await hasLiveJob(QUEUES.autoExpression, id))) {
      await this.documentsRepository.update(id, { autoExpression: 'FAILED' })
      return toSummary({ ...doc, autoExpression: 'FAILED' })
    }
    return toSummary(doc)
  }

  /**
   * Uploads go straight from the phone to storage (Vercel caps request bodies
   * at 4.5 MB): this hands out a link that accepts exactly this file. The
   * upload id becomes the document's id once the upload is completed.
   */
  async startUpload(userId: string, { fileName, size }: UploadStartBody) {
    const { ext, mime } = uploadType(fileName)
    if (size > env.MAX_UPLOAD_MB * 1024 * 1024) {
      throw new AppError(`That file is too large to import (the limit is ${env.MAX_UPLOAD_MB} MB)`, 413, 'FILE_TOO_LARGE')
    }
    const uploadId = randomUUID()
    const url = await storage.signedUploadUrl(sourceKey(userId, uploadId, ext), mime, size, UPLOAD_LINK_TTL_SECONDS)
    return { uploadId, url, method: 'PUT' as const, headers: { 'Content-Type': mime } }
  }

  /** Adds pasted text, a link, an uploaded file or today's digest */
  create(userId: string, body: CreateBody) {
    switch (body.from) {
      case 'text':
        return this.createFromText(userId, body)
      case 'url':
        return this.createFromUrl(userId, body)
      case 'upload':
        return this.completeUpload(userId, body)
      case 'digest':
        return this.digest(userId, body)
    }
  }

  /** The file is in storage: create the document and start reading it. Safe to repeat. */
  private async completeUpload(userId: string, { uploadId, fileName, language, script }: UploadCompleteBody) {
    const existing = await this.documentsRepository.findOwned(userId, uploadId)
    if (existing) return toSummary(existing)

    const { ext, kind, mime } = uploadType(fileName)
    const fileKey = sourceKey(userId, uploadId, ext)
    const size = await storage.size(fileKey)
    if (size === null) throw new AppError("The upload didn't finish. Try again.", 400, 'UPLOAD_NOT_FOUND')
    if (size === 0) {
      await storage.delete(fileKey)
      throw new AppError('That file is empty', 400, 'EMPTY_FILE')
    }

    const title = path.basename(fileName, path.extname(fileName)).replace(/[_-]+/g, ' ').trim() || 'Untitled'
    const doc = await this.documentsRepository.create({
      id: uploadId,
      userId,
      title: title.slice(0, 200),
      kind,
      fileName: fileName.slice(0, 255),
      mimeType: mime,
      fileKey,
      languageHint: languageHint(language),
      isScript: script,
    })
    await this.enqueue({ documentId: doc.id })
    return toSummary(doc)
  }

  /**
   * Pasted text of any length up to the limit: it's split into parts on the
   * server, so a long script never has to be cut up by hand.
   */
  private async createFromText(userId: string, { title, text, language, script }: TextBody) {
    const doc = await this.documentsRepository.create({
      userId,
      title: title || UNTITLED,
      kind: 'TEXT',
      mimeType: 'text/plain',
      languageHint: languageHint(language),
      isScript: script,
    })
    const fileKey = sourceKey(userId, doc.id, 'txt')
    await storage.put(fileKey, Buffer.from(text, 'utf8'), 'text/plain')
    const saved = await this.documentsRepository.update(doc.id, { fileKey })
    await this.enqueue({ documentId: doc.id })
    return toSummary(saved)
  }

  private async createFromUrl(userId: string, { url, language, script }: UrlBody) {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const doc = await this.documentsRepository.create({
      userId,
      title: host,
      kind: 'WEB',
      sourceUrl: url,
      author: host,
      languageHint: languageHint(language),
      isScript: script,
    })
    await this.enqueue({ documentId: doc.id })
    return toSummary(doc)
  }

  /**
   * "Translate": a new document in another language, beside the original.
   * The translation runs in the background and then imports like pasted text.
   */
  async translate(userId: string, id: string, { language }: TranslateBody) {
    const source = await this.owned(userId, id)
    if (source.status !== 'READY') throw new AppError('This document is still being prepared', 409, 'DOCUMENT_NOT_READY')
    if (source.language === language) throw new AppError(`This document is already in ${LANGUAGE_LABELS[language]}`, 400, 'SAME_LANGUAGE')
    await this.usageService.assertCanTranslate(userId, source.charCount)

    const doc = await this.documentsRepository.create({
      userId,
      folderId: source.folderId,
      title: `${source.title} · ${LANGUAGE_LABELS[language]}`.slice(0, 200),
      author: source.author,
      // Same shelf category as the original; the text itself is read as plain text
      kind: source.kind,
      mimeType: 'text/plain',
      sourceUrl: source.sourceUrl,
      languageHint: language,
      translatedFromId: source.id,
    })
    await startQueue()
    await queue.send(QUEUES.translateDocument, { documentId: doc.id, sourceId: source.id, language } satisfies TranslateDocumentJob)
    return toSummary(doc)
  }

  /**
   * "Today's digest": a short spoken briefing on what the listener added or
   * played in the last two weeks, written by a cheap text model and added to
   * the shelf like pasted text. One per day; asking again returns it.
   */
  private async digest(userId: string, { day }: DigestBody) {
    const existing = await this.documentsRepository.findDigest(userId, day)
    if (existing) return toSummary(existing)

    const recent = await this.documentsRepository.recentForDigest(userId, new Date(Date.now() - DIGEST_LOOKBACK_MS), DIGEST_ITEMS)
    if (!recent.length) throw new AppError('Add or listen to something first, and your digest will cover it.', 404, 'NOTHING_TO_DIGEST')

    const languages = recent.map((d) => d.language).filter((l): l is Lang => !!l && l !== 'mixed')
    const language = (languages.sort((a, b) => languages.filter((x) => x === b).length - languages.filter((x) => x === a).length)[0] ?? 'en') as Lang
    const sources = recent
      .map((d, i) => `### ${i + 1}. ${d.title}\n${d.chunks.map((c) => c.text).join(' ').slice(0, DIGEST_CHARS_PER_ITEM)}`)
      .join('\n\n')
    const text = (
      await chatCompletion(
        {
          model: env.OPENROUTER_TEXT_MODEL,
          system:
            `Write a friendly spoken morning briefing in ${DIGEST_LANGUAGES[language]} about the listener's recent reading below. ` +
            'Open with one warm sentence, then give each item a short paragraph with its main points, then close with one sentence. ' +
            'About 250 to 400 words in total. Plain sentences only, no headings, lists, emojis or markdown, because it will be read aloud.',
          content: [{ type: 'text', text: sources }],
          purpose: 'daily digest',
        },
        90_000,
      )
    ).trim()
    if (!text) throw new AppError("Couldn't write today's digest. Try again.", 502, 'PROVIDER_ERROR')

    try {
      const doc = await this.documentsRepository.create({
        userId,
        title: `${DIGEST_TITLES[language]} · ${day}`,
        kind: 'TEXT',
        mimeType: 'text/plain',
        languageHint: language,
        digestDay: day,
      })
      const fileKey = sourceKey(userId, doc.id, 'txt')
      await storage.put(fileKey, Buffer.from(text, 'utf8'), 'text/plain')
      const saved = await this.documentsRepository.update(doc.id, { fileKey })
      await this.enqueue({ documentId: doc.id })
      return toSummary(saved)
    } catch (e) {
      // Asked twice at once: the other request made it
      const other = (e as { code?: string }).code === 'P2002' ? await this.documentsRepository.findDigest(userId, day) : null
      if (other) return toSummary(other)
      throw e
    }
  }

  /** Renames, moves between folders and the shelf, or between the shelf and Studio */
  async update(userId: string, id: string, { title, folderId, script }: UpdateBody) {
    const doc = await this.owned(userId, id)
    if (folderId && !(await this.documentsRepository.findOwnedFolder(userId, folderId))) {
      throw new AppError('Folder not found', 404, 'FOLDER_NOT_FOUND')
    }
    const saved = await this.documentsRepository.update(id, { title, folderId, isScript: script })
    return toSummary({ ...saved, playback: doc.playback })
  }

  async reprocess(userId: string, id: string, ocr: boolean, keepClutter?: boolean) {
    const doc = await this.owned(userId, id)
    if (doc.status === 'PROCESSING' || doc.status === 'PENDING') {
      throw new AppError('This document is still being prepared', 409, 'DOCUMENT_BUSY')
    }
    if (ocr && (!['PDF', 'IMAGE'].includes(doc.kind) || doc.translatedFromId)) {
      throw new AppError('Only PDFs and photos can be re-read with OCR', 400, 'OCR_NOT_SUPPORTED')
    }
    await Promise.all([storage.deletePrefix(`audio/${doc.id}`), storage.deletePrefix(`exports/${doc.id}`)])
    // New chunks start without emotions, so suggestions can run again
    const saved = await this.documentsRepository.update(id, { status: 'PENDING', error: null, autoExpression: null, narrationStyle: null, narrationStrength: null, narrationBrief: Prisma.DbNull, keepClutter })
    await this.enqueue({ documentId: id, forceOcr: ocr })
    return toSummary({ ...saved, playback: doc.playback })
  }

  async remove(userId: string, id: string) {
    const doc = await this.owned(userId, id)
    await this.documentsRepository.delete(id)
    await Promise.all([
      storage.deletePrefix(`documents/${userId}/${doc.id}`),
      storage.deletePrefix(`audio/${doc.id}`),
      storage.deletePrefix(`exports/${doc.id}`),
    ]).catch((e) => console.error(`[documents] storage cleanup failed for ${id}`, e))
  }

  /**
   * The document as parts, for the player and the script editor: text with
   * sentence offsets for live highlighting, real durations for parts already
   * voiced in the current voice (null means it would be voiced next time), and
   * the listener's pronunciations, which the app applies to voices it makes itself.
   */
  async script(userId: string, id: string, voiceId?: string) {
    const doc = await this.owned(userId, id)
    if (doc.status !== 'READY') throw new AppError('This document is still being prepared', 409, 'DOCUMENT_NOT_READY')

    const [prefs, lexicon] = await Promise.all([this.voicesService.getPreferences(userId), lexiconFor(userId)])
    const chosen = voiceId ?? doc.playback[0]?.voiceId ?? null
    const resolved = Object.fromEntries(LANGS.map((lang) => [lang, this.voicesService.resolve(chosen, lang, prefs)])) as Record<Lang, VoiceDefinition>
    const perLang = <T>(pick: (v: VoiceDefinition) => T) => Object.fromEntries(LANGS.map((lang) => [lang, pick(resolved[lang])])) as Record<Lang, T>

    const chunks = await this.documentsRepository.listChunks(id)
    // Each part's voice: its own (a character's) or its language's
    const voiceOf = (c: DocumentChunk) => this.voicesService.forPart(c, resolved[c.language as Lang])
    const clips = await this.documentsRepository.readyClips(id, [...new Set(chunks.map((c) => voiceOf(c).id))])
    const known = new Map(clips.map((c) => [`${c.chunk.index}:${c.voiceId}`, c]))

    return {
      document: toSummary(doc),
      voices: perLang((v) => v.id),
      /** Whether each language's voice can take emotions */
      expressive: perLang((v) => v.expressive),
      /** Each language's voice level; "phone" voices are voiced by the app itself */
      tiers: perLang((v) => v.tier),
      speed: doc.playback[0]?.speed ?? prefs.speed,
      pronunciations: lexicon.rules,
      chunks: chunks.map((c: DocumentChunk) => {
        const voice = voiceOf(c)
        const clip = known.get(`${c.index}:${voice.id}`)
        // Audio made before the latest edit will be regenerated, so its length doesn't count
        const current = clip && clip.renderKey === planFor(c, voice, lexicon).key ? clip : null
        return {
          index: c.index,
          text: c.text,
          language: c.language as Lang,
          sentences: c.sentences,
          expressions: readExpressions(c.expressions),
          take: c.take,
          /** Sentences redone on their own: sentence index → take */
          sentenceTakes: readSentenceTakes(c.sentenceTakes),
          /** The voice that reads this part, its level, and whether it's the part's own (a character) */
          voiceId: voice.id,
          tier: voice.tier,
          expressive: voice.expressive,
          ownVoiceId: c.voiceId,
          pauseAfterMs: c.pauseAfterMs,
          locked: c.locked,
          estimatedMs: Math.round(c.estimatedDurationSec * 1000),
          durationMs: current?.durationMs ?? null,
          /** The voiced audio's loudness in 48 slices (0–100), once measured */
          peaks: (current?.blob?.peaks as number[] | null | undefined) ?? null,
        }
      }),
    }
  }
}
