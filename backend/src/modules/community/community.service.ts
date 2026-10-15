import { randomUUID } from 'node:crypto'
import {
  CLIP_MAX_CHARS,
  CLIPS_PER_DAY,
  CONTEST_PRIZE_MINUTES,
  COVER_URL_TTL_SECONDS,
  HEART_MIN_LISTEN_SEC,
  PUBLISH_MAX_CHARS,
  REPORTS_TO_HIDE,
  SIGNED_URL_TTL_SECONDS,
  WRITINGS_PER_DAY,
} from '../../config/constants.js'
import { env } from '../../config/env.js'
import type { Document, DocumentChunk, Prisma, PublicationKind } from '../../generated/prisma/client.js'
import { toCover } from '../../lib/image/cover.js'
import { queue, QUEUES, startQueue, type PublishCommunityJob } from '../../lib/queue.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import { isCatalogKey } from '../catalog/catalog.service.js'
import type { Lang } from '../ingestion/text/language.js'
import type { PlaybackService } from '../playback/playback.service.js'
import { lexiconFor } from '../pronunciations/lexicon-cache.js'
import { EMPTY_LEXICON, type PronunciationRule } from '../pronunciations/lexicon.js'
import { readLock, type TtsService } from '../tts/tts.service.js'
import type { UsageService } from '../usage/usage.service.js'
import { ownVoiceIsPrivate, ownVoiceLanguage } from '../voices/own-voice.js'
import { findVoice, isServerVoice, type ServerTier, type VoiceDefinition } from '../voices/voice-catalog.js'
import type { VoicesService } from '../voices/voices.service.js'
import type { CommunityRepository, PublicationWithWriter } from './community.repository.js'
import type { ClipBody, FeedQuery, PreviewQuery, PublishBody, ReportBody, ReviewBody, WritingBody } from './community.schema.js'
import { checkPublication } from './moderation.js'

const PAGE_SIZE = 20
const EXCERPT_CHARS = 280
// Parts voiced side by side when a writing is published, and tries per part
const VOICING_CONCURRENCY = 3
const PART_ATTEMPTS = 3
const PART_RETRY_MS = 5_000

// Pen names: letters and digits in any script, with spaces, dots, apostrophes, dashes and underscores between
const PEN_NAME = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'’_-]*$/u
const RESERVED_NAMES = ['listenup', 'admin', 'moderator', 'official', 'support']

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const cleanName = (name: string) => name.normalize('NFKC').replace(/\s+/g, ' ').trim()
/** Two pen names are the same if they differ only in case or spacing */
export const penNameKey = (name: string) => cleanName(name).toLowerCase()
const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The contest month, "YYYY-MM" in UTC */
export const currentMonth = () => new Date().toISOString().slice(0, 7)
/** When a contest month ends: the first moment of the next month (UTC) */
export function monthEnd(month: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1))
}
const todayStart = () => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/** Seconds a listener plays a writing before hearting it: half of it, at most two minutes */
export const listenToHeart = (durationSec: number) => Math.min(HEART_MIN_LISTEN_SEC, Math.ceil(durationSec / 2))

/** Rules from the writer's pronunciations that can apply to this text (the rest change nothing) */
function rulesIn(text: string, rules: PronunciationRule[]) {
  const haystack = flat(text).toLowerCase()
  return rules.filter((r) => haystack.includes(flat(r.word).toLowerCase()))
}

/** Why a document can't be published as a writing (or a clip taken from it), or null if it can */
function cantPublish(doc: Document, kind: 'writing' | 'clip'): { code: string; message: string } | null {
  if (doc.status !== 'READY') return { code: 'DOCUMENT_NOT_READY', message: 'This is still being prepared.' }
  if (doc.publicationId) return { code: 'NOT_YOURS', message: 'This came from Explore. Only its writer can publish it.' }
  if (isCatalogKey(doc.fileKey)) {
    return kind === 'clip' ? null : { code: 'NOT_YOURS', message: 'Classics are already in Explore. You can post a favourite line from one as a clip.' }
  }
  if (doc.digestDay) return { code: 'NOT_YOURS', message: 'Daily digests can’t be published.' }
  if (doc.translatedFromId) return { code: 'NOT_YOURS', message: 'Translations can’t be published. Publish the original instead.' }
  if (doc.kind === 'WEB' || doc.kind === 'EPUB') return { code: 'NOT_YOURS', message: 'Only your own writing can be published, not web pages or books.' }
  return null
}

type ViewerState = { hearted: Set<string>; copies: Map<string, string> }
/** Links to covers, by publication id */
type Covers = Map<string, string | null>

/** Time-limited links to these publications' cover pictures; those without one are left out */
export async function coverUrls(publications: { id: string; coverKey: string | null }[]): Promise<Covers> {
  const withCover = publications.filter((p) => p.coverKey)
  // A cover that can't be linked to right now falls back to the drawn one
  const urls = await Promise.all(withCover.map((p) => storage.signedUrl(p.coverKey!, COVER_URL_TTL_SECONDS).catch(() => null)))
  return new Map(withCover.map((p, i) => [p.id, urls[i]]))
}

/** Client-facing publication */
export function toItem(p: PublicationWithWriter, viewerId: string, state?: ViewerState, covers?: Covers) {
  const mine = p.userId === viewerId
  return {
    id: p.id,
    kind: p.kind === 'WRITING' ? ('writing' as const) : ('clip' as const),
    title: p.title,
    language: p.language,
    excerpt: p.excerpt,
    /** A clip's words */
    text: p.text,
    /** Who wrote a quoted clip; null when it's the publisher's own */
    credit: p.credit,
    durationSec: p.durationSec,
    voiceId: p.voiceId,
    /** The writer's cover picture; null for the drawn cover */
    coverUrl: covers?.get(p.id) ?? null,
    penName: p.user.penName ?? 'A listener',
    hearts: p.hearts,
    listens: p.listens,
    publishedAt: p.publishedAt,
    /** "YYYY-MM" when it's a contest entry */
    contestMonth: p.contestMonth,
    mine,
    hearted: state?.hearted.has(p.id) ?? false,
    /** The viewer's copy on their shelf, once added */
    documentId: state?.copies.get(p.id) ?? null,
    // Only the writer sees where it stands
    ...(mine && { status: p.status, statusNote: p.statusNote, createdAt: p.createdAt }),
  }
}
export type CommunityItem = ReturnType<typeof toItem>

const encodeCursor = (p: { publishedAt: Date | null; id: string }) => `${p.publishedAt?.toISOString()}_${p.id}`
function decodeCursor(cursor?: string) {
  const [at, id] = cursor?.split('_') ?? []
  const date = at ? new Date(at) : null
  return date && !Number.isNaN(date.getTime()) && id ? { at: date, id } : null
}

const notFound = () => new AppError('That’s no longer in Explore', 404, 'PUBLICATION_NOT_FOUND')

/**
 * Explore's Community: writings people publish (voiced the way they set them
 * up, frozen at publishing) and short voice clips. Everything is checked by AI
 * before anyone sees it; listeners can heart, report and block. A writing's
 * audio is made once, at the writer's cost, so listening to it costs nobody anything.
 */
export class CommunityService {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly voicesService: VoicesService,
    private readonly usageService: UsageService,
    private readonly ttsService: TtsService,
    private readonly playbackService: PlaybackService,
  ) {}

  private async enqueue(job: PublishCommunityJob) {
    await startQueue()
    await queue.send(QUEUES.publishCommunity, job, { singletonKey: job.publicationId })
  }

  // --- The writer

  async isAdmin(userId: string) {
    const user = await this.communityRepository.findUser(userId)
    return !!user && env.ADMIN_EMAILS.includes(user.email.toLowerCase())
  }

  async assertAdmin(userId: string) {
    if (!(await this.isAdmin(userId))) throw new AppError('Only the ListenUp team can do that', 403, 'FORBIDDEN')
  }

  async profile(userId: string) {
    const user = await this.communityRepository.findUser(userId)
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND')
    return {
      penName: user.penName,
      rulesAccepted: user.communityRulesAt !== null,
      /** Reviews reported publications and sets the contest theme */
      isAdmin: env.ADMIN_EMAILS.includes(user.email.toLowerCase()),
    }
  }

  async setPenName(userId: string, raw: string) {
    const name = cleanName(raw)
    if (!PEN_NAME.test(name)) throw new AppError('Use letters and numbers in your pen name (spaces, dots and dashes are fine too).', 400, 'INVALID_PEN_NAME')
    if (RESERVED_NAMES.some((r) => penNameKey(name).replace(/[^\p{L}]/gu, '').includes(r))) {
      throw new AppError('That pen name could be mistaken for the ListenUp team. Try another.', 400, 'INVALID_PEN_NAME')
    }
    if (!(await this.communityRepository.setPenName(userId, name, penNameKey(name)))) {
      throw new AppError('Another writer already has that pen name. Try another.', 409, 'PEN_NAME_TAKEN')
    }
    return this.profile(userId)
  }

  /** The writer's pen name, set now if given; publishing needs one */
  private async penNameFor(userId: string, raw?: string) {
    if (raw) return (await this.setPenName(userId, raw)).penName!
    const user = await this.communityRepository.findUser(userId)
    if (!user?.penName) throw new AppError('Choose a pen name first. It’s shown on everything you publish.', 400, 'PEN_NAME_REQUIRED')
    return user.penName
  }

  private async ownedDocument(userId: string, id: string) {
    const doc = await this.communityRepository.findDocument(userId, id)
    if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
    return doc
  }

  private async assertDailyLimit(userId: string, kind: PublicationKind) {
    const max = kind === 'WRITING' ? WRITINGS_PER_DAY : CLIPS_PER_DAY
    if ((await this.communityRepository.countSince(userId, kind, todayStart())) >= max) {
      throw new AppError(`That's ${max} ${kind === 'WRITING' ? 'writings' : 'clips'} today, the most in one day. Publish more tomorrow.`, 429, 'PUBLISH_LIMIT')
    }
  }

  /**
   * The writing as it will be published: every part frozen with its own voice
   * (a character's, or the writer's voice for each language), its emotions and
   * takes, and the writer's pronunciations as they are now. Also what's left to
   * voice, which the writer pays for once.
   */
  private async draft(userId: string, doc: Document & { playback: { voiceId: string | null }[] }, voiceId: string | undefined) {
    const chunks = await this.communityRepository.listChunks(doc.id)
    const charCount = chunks.reduce((n, c) => n + c.text.length, 0)
    if (!charCount) throw new AppError('There’s nothing to publish in this one.', 400, 'EMPTY_DOCUMENT')

    if (ownVoiceLanguage(voiceId)) throw ownVoiceIsPrivate()
    const [listener, lexicon] = await Promise.all([this.voicesService.getPreferences(userId), lexiconFor(userId)])
    // Every listener hears a writing in the voices it's published with, so the writer's own voice is left out
    const prefs = { ...listener, own: null }
    const docVoice = doc.playback[0]?.voiceId
    const mainLanguage = (doc.language && doc.language !== 'mixed' ? doc.language : chunks[0].language) as Lang
    const voice = findVoice(voiceId) ?? this.voicesService.resolve(docVoice, mainLanguage, prefs)
    if (!isServerVoice(voice)) {
      throw new AppError('Phone voices sound different on every phone. Pick a Natural or Expressive voice to publish with.', 400, 'PHONE_VOICE')
    }
    if (!chunks.some((c) => c.language === voice.language)) throw new AppError(`${voice.name} doesn’t read the language this is written in.`, 400, 'INVALID_VOICE')

    const parts = chunks.map((c) => {
      const own = findVoice(c.voiceId)
      const partVoice =
        own?.language === c.language && isServerVoice(own)
          ? own.id
          : c.language === voice.language
            ? null
            : this.voicesService.resolveServer(docVoice, c.language as Lang, prefs).id
      const rules = c.locked ? (readLock(c.lockedLexicon)?.rules ?? []) : rulesIn(c.text, lexicon.rules)
      return {
        index: c.index,
        text: c.text,
        language: c.language,
        sentences: c.sentences as Prisma.InputJsonValue,
        expressions: (c.expressions ?? undefined) as Prisma.InputJsonValue | undefined,
        narration: c.narration,
        take: c.take,
        sentenceTakes: (c.sentenceTakes ?? undefined) as Prisma.InputJsonValue | undefined,
        voiceId: partVoice,
        pauseAfterMs: c.pauseAfterMs,
        // Locked, so the writer's later pronunciations never change what listeners hear
        locked: true,
        lockedLexicon: { rules } as unknown as Prisma.InputJsonValue,
        estimatedDurationSec: c.estimatedDurationSec,
      }
    })

    // What isn't voiced yet in exactly this form (the writer may have heard it all already)
    const needed: Record<ServerTier, number> = { natural: 0, expressive: 0 }
    await Promise.all(
      parts.map(async (part) => {
        const chunk = { ...part, id: '', documentId: '' } as unknown as DocumentChunk
        const partVoice = this.voicesService.forPartServer(chunk, voice)
        if (!(await this.ttsService.hasAudio(chunk, partVoice, EMPTY_LEXICON))) needed[partVoice.tier] += part.estimatedDurationSec
      }),
    )
    const durationSec = Math.round(parts.reduce((n, p) => n + p.estimatedDurationSec + p.pauseAfterMs / 1000, 0))
    const language = doc.language && doc.language !== 'mixed' ? doc.language : voice.language
    return { parts, voice, needed, charCount, durationSec, language }
  }

  /** Before publishing a writing: whether it can be, what's left to voice, and the contest */
  async preview(userId: string, { documentId, voiceId }: PreviewQuery) {
    const doc = await this.ownedDocument(userId, documentId)
    const [user, existing, entry] = await Promise.all([
      this.communityRepository.findUser(userId),
      this.communityRepository.findActiveFrom(userId, doc.id),
      this.communityRepository.findEntry(userId, currentMonth()),
    ])
    const contest = await this.contestSummary(entry, userId)
    const base = { penName: user?.penName ?? null, title: doc.title, contest, existing }
    const blocked = cantPublish(doc, 'writing')
    if (blocked) return { ...base, canPublish: false, reason: blocked.message }
    try {
      const draft = await this.draft(userId, doc, voiceId)
      if (draft.charCount > PUBLISH_MAX_CHARS) {
        return { ...base, canPublish: false, reason: `Writings in Explore can be up to ${PUBLISH_MAX_CHARS.toLocaleString('en')} characters, and this has ${draft.charCount.toLocaleString('en')}. Publish a shorter piece, or a part of it.` }
      }
      return {
        ...base,
        canPublish: true,
        reason: null,
        voiceId: draft.voice.id,
        language: draft.language,
        charCount: draft.charCount,
        durationSec: draft.durationSec,
        /** Seconds still to voice per level, from the writer's minutes */
        toVoice: { natural: Math.round(draft.needed.natural), expressive: Math.round(draft.needed.expressive) },
      }
    } catch (e) {
      if (e instanceof AppError && e.statusCode < 500) return { ...base, canPublish: false, reason: e.message }
      throw e
    }
  }

  private async contestSummary(entry: PublicationWithWriter | null, userId: string) {
    const month = currentMonth()
    const contest = await this.communityRepository.findContest(month)
    return { month, theme: contest?.theme ?? null, endsAt: monthEnd(month), prizeMinutes: CONTEST_PRIZE_MINUTES, entry: entry ? toItem(entry, userId, undefined, await coverUrls([entry])) : null }
  }

  publish(userId: string, body: PublishBody) {
    return body.kind === 'writing' ? this.publishWriting(userId, body) : this.publishClip(userId, body)
  }

  private async publishWriting(userId: string, body: WritingBody) {
    const doc = await this.ownedDocument(userId, body.documentId)
    const blocked = cantPublish(doc, 'writing')
    if (blocked) throw new AppError(blocked.message, 400, blocked.code)
    if (await this.communityRepository.findActiveFrom(userId, doc.id)) {
      throw new AppError('This is already in Explore. Unpublish it first to publish it again.', 409, 'ALREADY_PUBLISHED')
    }
    await this.assertDailyLimit(userId, 'WRITING')
    const month = currentMonth()
    if (body.contest && (await this.communityRepository.findEntry(userId, month))) {
      throw new AppError('You’ve entered a writing this month already. One entry a month.', 409, 'ALREADY_ENTERED')
    }
    const penName = await this.penNameFor(userId, body.penName)
    const draft = await this.draft(userId, doc, body.voiceId)
    if (draft.charCount > PUBLISH_MAX_CHARS) {
      throw new AppError(`Writings in Explore can be up to ${PUBLISH_MAX_CHARS.toLocaleString('en')} characters.`, 400, 'TOO_LONG')
    }
    // The audio is made once, from the writer's minutes; refuse now rather than half-way
    await this.usageService.assertCovers(userId, draft.needed)
    // Last, so a picture that can't be used stops here and nothing is left behind by the checks above
    const coverKey = body.cover ? await this.storeCover(userId, body.cover) : null

    const text = draft.parts.map((p) => p.text).join(' ')
    let publication: PublicationWithWriter
    try {
      publication = await this.communityRepository.createWriting(
        {
          userId,
          title: body.title,
          author: penName,
          kind: 'TEXT',
          mimeType: 'text/plain',
          status: 'READY',
          language: doc.language,
          excerpt: flat(text).slice(0, EXCERPT_CHARS),
          charCount: draft.charCount,
          chunkCount: draft.parts.length,
          estimatedDurationSec: draft.durationSec,
          narrationStyle: doc.narrationStyle,
          narrationStrength: doc.narrationStrength,
        },
        draft.parts,
        {
          userId,
          kind: 'WRITING',
          title: body.title,
          language: draft.language,
          voiceId: draft.voice.id,
          excerpt: flat(text).slice(0, EXCERPT_CHARS),
          charCount: draft.charCount,
          durationSec: draft.durationSec,
          sourceId: doc.id,
          contestMonth: body.contest ? month : null,
          coverKey,
        },
      )
    } catch (e) {
      if (coverKey) await storage.delete(coverKey).catch(() => {})
      // Entered from two phones at once
      if ((e as { code?: string }).code === 'P2002') throw new AppError('You’ve entered a writing this month already. One entry a month.', 409, 'ALREADY_ENTERED')
      throw e
    }
    await this.communityRepository.acceptRules(userId)
    await this.enqueue({ publicationId: publication.id })
    return toItem(publication, userId, undefined, await coverUrls([publication]))
  }

  /** The writer's picture as a cover in storage; its key. Kept under the writer, so closing the account removes it. */
  private async storeCover(userId: string, base64: string) {
    const cover = await toCover(Buffer.from(base64, 'base64'))
    const key = `covers/${userId}/${randomUUID()}.jpg`
    await storage.put(key, cover, 'image/jpeg')
    return key
  }

  /** A line or paragraph, voiced now like a voice note (without the "Made with ListenUp" ending) */
  private async publishClip(userId: string, body: ClipBody) {
    const doc = await this.ownedDocument(userId, body.documentId)
    const blocked = cantPublish(doc, 'clip')
    if (blocked) throw new AppError(blocked.message, 400, blocked.code)
    await this.assertDailyLimit(userId, 'CLIP')
    await this.penNameFor(userId, body.penName)
    const { text, voice, audio } = await this.playbackService.voiceClip(userId, doc.id, body, CLIP_MAX_CHARS, true)
    const publication = await this.communityRepository.createClip({
      userId,
      kind: 'CLIP',
      title: doc.title,
      language: voice.language,
      voiceId: voice.id,
      excerpt: flat(text).slice(0, EXCERPT_CHARS),
      text,
      // A line from a classic is credited to its author
      credit: isCatalogKey(doc.fileKey) ? doc.author : null,
      charCount: text.length,
      durationSec: Math.max(1, Math.round(audio.durationMs / 1000)),
      sourceId: doc.id,
      blobHash: audio.hash,
    })
    await this.communityRepository.acceptRules(userId)
    await this.enqueue({ publicationId: publication.id })
    return toItem(publication, userId)
  }

  async mine(userId: string) {
    const items = await this.communityRepository.mine(userId)
    const [state, covers] = await Promise.all([this.communityRepository.viewerState(userId, items.map((p) => p.id)), coverUrls(items)])
    return items.map((p) => toItem(p, userId, state, covers))
  }

  /** The writer takes it down: out of Explore and off every listener's shelf */
  async unpublish(userId: string, id: string) {
    const p = await this.communityRepository.findById(id)
    if (!p || p.userId !== userId) throw notFound()
    await this.communityRepository.remove(p)
    if (p.coverKey) await storage.delete(p.coverKey).catch((e) => console.warn(`[community] cover of ${id} not deleted`, e))
  }

  /** Again, after it couldn't be made ready (out of minutes, or the check was down) */
  async retry(userId: string, id: string) {
    const p = await this.communityRepository.findById(id)
    if (!p || p.userId !== userId) throw notFound()
    if (p.status !== 'FAILED') throw new AppError('This isn’t waiting to be tried again', 409, 'NOT_FAILED')
    await this.communityRepository.setStatus(id, 'CHECKING', { statusNote: null })
    await this.enqueue({ publicationId: id })
    return toItem({ ...p, status: 'CHECKING', statusNote: null }, userId, undefined, await coverUrls([p]))
  }

  // --- Listeners

  async feed(viewerId: string, { kind, cursor }: FeedQuery) {
    const rows = await this.communityRepository.feed(viewerId, kind === 'writing' ? 'WRITING' : 'CLIP', decodeCursor(cursor), PAGE_SIZE + 1)
    const page = rows.slice(0, PAGE_SIZE)
    const [state, covers] = await Promise.all([this.communityRepository.viewerState(viewerId, page.map((p) => p.id)), coverUrls(page)])
    return { items: page.map((p) => toItem(p, viewerId, state, covers)), next: rows.length > PAGE_SIZE ? encodeCursor(page[page.length - 1]) : null }
  }

  private async visible(viewerId: string, id: string) {
    const p = await this.communityRepository.findById(id)
    if (!p || (p.userId !== viewerId && (p.status !== 'LIVE' || p.user.closedAt))) throw notFound()
    return p
  }

  /** Seconds the viewer still has to play a writing before they can heart it */
  private async stillToListen(viewerId: string, p: { id: string; kind: PublicationKind; durationSec: number }) {
    if (p.kind !== 'WRITING') return 0
    const progress = await this.communityRepository.copyProgress(viewerId, p.id)
    return Math.max(0, listenToHeart(p.durationSec) - (progress?.listenedSec ?? 0))
  }

  async get(viewerId: string, id: string) {
    const p = await this.visible(viewerId, id)
    const [state, toListen, covers] = await Promise.all([this.communityRepository.viewerState(viewerId, [id]), this.stillToListen(viewerId, p), coverUrls([p])])
    return {
      ...toItem(p, viewerId, state, covers),
      /** Hearts are for what you've heard: seconds of listening still needed */
      heartAfterSec: p.userId === viewerId ? null : toListen,
    }
  }

  async heart(viewerId: string, id: string) {
    const p = await this.visible(viewerId, id)
    if (p.userId === viewerId) throw new AppError('You can’t heart your own work', 400, 'OWN_WORK')
    if ((await this.stillToListen(viewerId, p)) > 0) {
      throw new AppError('Listen a little longer first: hearts are for writing you’ve heard.', 403, 'LISTEN_FIRST')
    }
    return this.communityRepository.addVote(id, viewerId)
  }

  async unheart(viewerId: string, id: string) {
    await this.visible(viewerId, id)
    return this.communityRepository.removeVote(id, viewerId)
  }

  async report(viewerId: string, id: string, { reason, note }: ReportBody) {
    const p = await this.visible(viewerId, id)
    if (p.userId === viewerId) throw new AppError('You can unpublish your own work instead', 400, 'OWN_WORK')
    await this.communityRepository.report(id, viewerId, reason, note, REPORTS_TO_HIDE)
  }

  /** Blocks whoever published this: nothing of theirs shows in the viewer's Explore any more */
  async blockWriter(viewerId: string, id: string) {
    const p = await this.communityRepository.findById(id)
    if (!p) throw notFound()
    if (p.userId === viewerId) throw new AppError('That’s you', 400, 'OWN_WORK')
    await this.communityRepository.block(viewerId, p.userId)
  }

  async unblock(viewerId: string, userId: string) {
    await this.communityRepository.unblock(viewerId, userId)
  }

  async blocks(viewerId: string) {
    return (await this.communityRepository.blocks(viewerId)).map((b) => ({ userId: b.blockedId, penName: b.blocked.penName ?? 'A listener', blockedAt: b.createdAt }))
  }

  /** A clip's audio; each play counts as a listen */
  async clipAudio(viewerId: string, id: string) {
    const p = await this.visible(viewerId, id)
    if (p.kind !== 'CLIP' || !p.blobHash) throw notFound()
    const blob = await this.communityRepository.findBlob(p.blobHash)
    if (!blob) throw new AppError('This clip’s audio is missing', 410, 'AUDIO_UNAVAILABLE')
    if (p.userId !== viewerId) await this.communityRepository.countListen(id)
    return { url: await storage.signedUrl(blob.storageKey, SIGNED_URL_TTL_SECONDS), durationMs: blob.durationMs, mimeType: blob.mimeType }
  }

  // --- The ListenUp team

  async reviewQueue(adminId: string) {
    await this.assertAdmin(adminId)
    const rows = await this.communityRepository.reviewQueue()
    const covers = await coverUrls(rows)
    return rows.map((p) => ({
      id: p.id,
      coverUrl: covers.get(p.id) ?? null,
      kind: p.kind === 'WRITING' ? 'writing' : 'clip',
      status: p.status,
      statusNote: p.statusNote,
      title: p.title,
      language: p.language,
      penName: p.user.penName,
      email: p.user.email,
      text: (p.text ?? p.master?.chunks.map((c) => c.text).join('\n\n') ?? p.excerpt).slice(0, 6000),
      reports: p.flags,
      updatedAt: p.updatedAt,
    }))
  }

  /**
   * Restore puts a reported piece back (its report count starts again), or
   * publishes one the AI check wrongly turned down. Remove takes it out of
   * Explore and off every shelf, telling the writer why.
   */
  async review(adminId: string, id: string, { action, note }: ReviewBody) {
    await this.assertAdmin(adminId)
    const p = await this.communityRepository.findById(id)
    if (!p) throw notFound()
    if (action === 'remove') {
      await this.communityRepository.takeDown(id, note || 'Taken down for breaking the community rules.')
      return
    }
    if (p.status === 'HIDDEN') {
      await this.communityRepository.setStatus(id, 'LIVE', { reports: 0, statusNote: null })
    } else if (p.status === 'REJECTED' || p.status === 'REMOVED') {
      await this.communityRepository.setStatus(id, 'CHECKING', { reports: 0, statusNote: null })
      await this.enqueue({ publicationId: id, skipCheck: true })
    }
  }

  // --- Background: the check, then a writing's audio

  /**
   * Checks a new publication with AI and, for a writing, voices every part
   * once at the writer's cost (a background job). Returns quietly when it was
   * unpublished meanwhile. Throws on errors worth trying again.
   */
  async process({ publicationId, skipCheck }: PublishCommunityJob) {
    const p = await this.communityRepository.findForVoicing(publicationId)
    if (!p || p.status !== 'CHECKING') return

    // Said to the writer on a piece that went live without the cover they chose
    let coverNote: string | null = null
    // The check passed it but may have been talked round: ready, but out of Explore until reviewed
    let holdForReview = false
    if (!skipCheck) {
      const text = p.kind === 'CLIP' ? (p.text ?? '') : (p.master?.chunks.map((c) => c.text).join('\n\n') ?? '')
      // A cover that's gone from storage is treated as no cover
      const cover = p.coverKey ? await storage.get(p.coverKey).catch(() => null) : null
      const verdict = await checkPublication({ title: p.title, text, credit: p.credit, userId: p.userId, cover })
      if (!verdict.publish) {
        // Out of the contest too, so a fixed version can be entered this month
        await this.settleStatus(publicationId, 'REJECTED', { statusNote: verdict.reason ?? 'This doesn’t fit the community rules.', contestMonth: null })
        return
      }
      holdForReview = verdict.needsReview
      if (p.coverKey && (!cover || !verdict.coverOk)) {
        // The writing is fine and its picture isn't: it's published with the drawn cover instead
        await this.communityRepository.clearCover(publicationId)
        await storage.delete(p.coverKey).catch(() => {})
        coverNote = `It’s in Explore without your cover picture. ${verdict.coverReason ?? 'The picture doesn’t fit the community rules.'}`
      }
    }

    let durationSec = p.durationSec
    if (p.kind === 'WRITING') {
      const voice = findVoice(p.voiceId)
      if (!p.master || !voice || !isServerVoice(voice)) {
        await this.settleStatus(publicationId, 'FAILED', { statusNote: 'This voice isn’t available any more. Unpublish it and publish it again with another voice.' })
        return
      }
      const result = await this.voiceAll(p.userId, p.master.chunks, voice)
      if ('failed' in result) {
        await this.settleStatus(publicationId, 'FAILED', { statusNote: result.failed })
        return
      }
      durationSec = result.durationSec
    }
    if (holdForReview) {
      // Restoring it from the review list puts it live (restore, HIDDEN → LIVE)
      console.warn(`[community] ${publicationId} passed the check but is held for review`)
      await this.settleStatus(publicationId, 'HIDDEN', { publishedAt: new Date(), statusNote: 'We’re taking a quick look at this before it goes into Explore.', durationSec })
      return
    }
    await this.settleStatus(publicationId, 'LIVE', { publishedAt: new Date(), statusNote: coverNote, durationSec })
  }

  /** When every try failed: tell the writer it can be tried again */
  async giveUp(publicationId: string) {
    await this.settleStatus(publicationId, 'FAILED', { statusNote: 'We couldn’t get this ready just now. Try again in a little while.' })
  }

  /** Moves it on, unless the writer unpublished it meanwhile */
  private async settleStatus(id: string, status: 'LIVE' | 'HIDDEN' | 'REJECTED' | 'FAILED', data: Prisma.PublicationUncheckedUpdateInput) {
    await this.communityRepository.setStatus(id, status, data).catch((e) => {
      if ((e as { code?: string }).code !== 'P2025') throw e
    })
  }

  /** Every part of a writing in its voice, a few at a time; its length, or why it stopped */
  private async voiceAll(userId: string, chunks: DocumentChunk[], voice: VoiceDefinition & { tier: ServerTier }): Promise<{ durationSec: number } | { failed: string }> {
    let next = 0
    let totalMs = 0
    let failed: string | null = null
    const worker = async () => {
      while (!failed && next < chunks.length) {
        const chunk = chunks[next++]
        const partVoice = this.voicesService.forPartServer(chunk, voice)
        for (let attempt = 1; ; attempt++) {
          try {
            // Parts are locked with the writer's pronunciations, so no lexicon is needed here
            const clip = await this.ttsService.ensureClip(userId, chunk, partVoice, EMPTY_LEXICON, { background: true })
            totalMs += clip.durationMs + chunk.pauseAfterMs
            break
          } catch (e) {
            const code = e instanceof AppError ? e.code : undefined
            if (code === 'USAGE_LIMIT_REACHED') failed = `You ran out of ${partVoice.tier === 'expressive' ? 'Expressive' : 'Natural'} minutes before the audio was ready. Try again once you have more: the parts already made are kept.`
            else if (code === 'BUDGET_PAUSED') failed = 'Publishing is paused for today. Try again tomorrow: the parts already made are kept.'
            else if (attempt >= PART_ATTEMPTS) failed = `We couldn’t voice part ${chunk.index + 1}. Try again in a little while.`
            if (failed) return
            await sleep(PART_RETRY_MS)
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(VOICING_CONCURRENCY, chunks.length) }, worker))
    return failed ? { failed } : { durationSec: Math.round(totalMs / 1000) }
  }
}
