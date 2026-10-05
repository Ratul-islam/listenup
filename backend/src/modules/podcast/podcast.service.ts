import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { API_PREFIX } from '../../config/constants.js'
import { env } from '../../config/env.js'
import { storage } from '../../lib/storage/storage.js'
import { AppError } from '../../utils/AppError.js'
import type { ExportsService } from '../exports/exports.service.js'
import { planAtLeast } from '../plans/plan-catalog.js'
import type { PodcastRepository } from './podcast.repository.js'

// Podcast apps download episodes whenever they like, so each request gets a fresh link
const EPISODE_URL_TTL_SECONDS = 6 * 60 * 60

// backend/assets, next to src/ in development and dist/ in the image
const COVER_FILE = new URL('../../../assets/podcast-cover.jpg', import.meta.url)

type Episode = NonNullable<Awaited<ReturnType<PodcastRepository['episode']>>>

const plusRequired = () => new AppError('The private podcast is part of Plus and Pro.', 403, 'PREMIUM_REQUIRED')
const notFound = () => new AppError('Not found', 404, 'NOT_FOUND')

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

/** "h:mm:ss", as podcast apps show it */
const itunesDuration = (ms: number) => {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const base = () => `${env.PUBLIC_URL.replace(/\/$/, '')}${API_PREFIX}/podcast`
const feedUrl = (token: string) => `${base()}/${token}/feed.xml`
const coverUrl = () => `${base()}/cover.jpg`
/**
 * The MP3's name (its render key) rides along as `v`, so when an episode is
 * rebuilt in another voice, podcast apps see a new file and download it again.
 */
const episodeUrl = (token: string, e: Episode) => {
  const version = e.export?.storageKey?.split('/').pop()?.replace(/\.mp3$/, '').slice(0, 16)
  return `${base()}/${token}/episodes/${e.id}.mp3${version ? `?v=${version}` : ''}`
}

const playable = (e: Episode) => !!e.export?.storageKey && (e.export.status === 'READY' || !!e.export.sizeBytes)

// RSS wants a language tag; "mixed" documents are Bangla with English in them
const RSS_LANGUAGE: Record<string, string> = { mixed: 'bn', pt: 'pt-br' }

/** The language most episodes are in, for podcast apps that sort or filter by it */
const feedLanguage = (episodes: Episode[]) => {
  const counts = new Map<string, number>()
  for (const e of episodes) if (e.language) counts.set(e.language, (counts.get(e.language) ?? 0) + 1)
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'en'
  return RSS_LANGUAGE[top] ?? top
}

/**
 * "Private podcast" (Plus and Pro): documents the listener picks become MP3
 * episodes in an RSS feed only they know the address of, so any podcast app
 * (and the car) can play them. Episodes are the documents' MP3 exports; the
 * feed and episode links are authenticated by the secret in the address,
 * which can be replaced.
 */
export class PodcastService {
  constructor(
    private readonly podcastRepository: PodcastRepository,
    private readonly exportsService: ExportsService,
  ) {}

  private async member(userId: string) {
    const user = await this.podcastRepository.findUser(userId)
    if (!user || user.closedAt) throw notFound()
    return { user, included: planAtLeast(user.plan, 'plus') }
  }

  private async ensureToken(userId: string, token: string | null) {
    return token ?? (await this.podcastRepository.setToken(userId, randomBytes(24).toString('base64url'))).podcastToken!
  }

  private view(e: Episode) {
    return {
      documentId: e.id,
      title: e.title,
      addedAt: e.podcastAddedAt?.toISOString() ?? null,
      status: e.export?.status ?? 'NONE',
      playable: playable(e),
      chunksDone: e.export?.chunksDone ?? 0,
      chunkCount: e.export?.chunkCount ?? 0,
      durationMs: e.export?.durationMs ?? null,
      error: e.export?.status === 'FAILED' ? e.export.error : null,
    }
  }

  async overview(userId: string) {
    const { user, included } = await this.member(userId)
    if (!included) return { enabled: false, feedUrl: null, episodes: [] }
    const token = await this.ensureToken(userId, user.podcastToken)
    const episodes = await this.podcastRepository.episodes(userId)
    return { enabled: true, feedUrl: feedUrl(token), episodes: episodes.map((e) => this.view(e)) }
  }

  /** A new secret address; podcast apps subscribed to the old one stop getting anything */
  async resetLink(userId: string) {
    const { included } = await this.member(userId)
    if (!included) throw plusRequired()
    await this.podcastRepository.setToken(userId, randomBytes(24).toString('base64url'))
    return this.overview(userId)
  }

  /**
   * Adds a document and builds its MP3 in the current voice (or brings an older
   * MP3 up to date). New audio counts against the allowance, as for downloads.
   */
  async add(userId: string, documentId: string) {
    const { included } = await this.member(userId)
    if (!included) throw plusRequired()
    await this.exportsService.start(userId, documentId)
    if (!(await this.podcastRepository.setAdded(userId, documentId, true))) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
    return this.view((await this.podcastRepository.episode(userId, documentId))!)
  }

  async remove(userId: string, documentId: string) {
    await this.podcastRepository.setAdded(userId, documentId, false)
  }

  async episode(userId: string, documentId: string) {
    const e = await this.podcastRepository.episode(userId, documentId)
    return e ? this.view(e) : null
  }

  /** The feed's owner, and whether their plan still includes it */
  private async feedOwner(token: string) {
    const user = await this.podcastRepository.findUserByToken(token)
    if (!user || user.closedAt) throw notFound()
    return { user, included: planAtLeast(user.plan, 'plus') }
  }

  /**
   * RSS 2.0 with Apple's podcast tags; kept out of podcast directories. When the
   * plan ends, the feed stays up but empty (podcast apps drop feeds that
   * disappear), so the episodes come back if the listener subscribes again.
   */
  async feed(token: string) {
    const { user, included } = await this.feedOwner(token)
    const episodes = included ? (await this.podcastRepository.episodes(user.id)).filter(playable) : []
    const title = user.name ? `${user.name}'s ListenUp` : 'My ListenUp'
    const description = included
      ? 'Documents you added to your private ListenUp podcast. Keep this feed address to yourself.'
      : 'Your ListenUp plan no longer includes the private podcast. Your episodes come back here when you subscribe to Plus or Pro again.'
    const items = episodes.map((e) => {
      const summary = e.excerpt ?? e.author ?? ''
      return [
        '<item>',
        `<title>${escapeXml(e.title)}</title>`,
        `<guid isPermaLink="false">${e.id}</guid>`,
        `<pubDate>${(e.podcastAddedAt ?? e.export!.updatedAt).toUTCString()}</pubDate>`,
        summary ? `<description>${escapeXml(summary)}</description>` : '',
        `<enclosure url="${escapeXml(episodeUrl(token, e))}" length="${e.export!.sizeBytes ?? 0}" type="audio/mpeg"/>`,
        e.export!.durationMs ? `<itunes:duration>${itunesDuration(e.export!.durationMs)}</itunes:duration>` : '',
        e.author ? `<itunes:author>${escapeXml(e.author)}</itunes:author>` : '',
        '<itunes:episodeType>full</itunes:episodeType>',
        '</item>',
      ]
        .filter(Boolean)
        .join('')
    })
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">',
      '<channel>',
      `<title>${escapeXml(title)}</title>`,
      `<link>${escapeXml(env.PUBLIC_URL)}</link>`,
      `<atom:link href="${escapeXml(feedUrl(token))}" rel="self" type="application/rss+xml"/>`,
      `<description>${escapeXml(description)}</description>`,
      `<language>${feedLanguage(episodes)}</language>`,
      `<image><url>${escapeXml(coverUrl())}</url><title>${escapeXml(title)}</title><link>${escapeXml(env.PUBLIC_URL)}</link></image>`,
      `<itunes:image href="${escapeXml(coverUrl())}"/>`,
      '<itunes:author>ListenUp</itunes:author>',
      '<itunes:explicit>false</itunes:explicit>',
      '<itunes:type>episodic</itunes:type>',
      '<itunes:block>yes</itunes:block>',
      ...items,
      '</channel>',
      '</rss>',
    ].join('\n')
  }

  private async playableEpisode(token: string, file: string) {
    const { user, included } = await this.feedOwner(token)
    if (!included) throw notFound()
    const e = await this.podcastRepository.episode(user.id, file.replace(/\.mp3$/i, ''))
    if (!e || !playable(e)) throw notFound()
    return e
  }

  /** Where an episode's MP3 is right now (a short-lived storage link) */
  async episodeFile(token: string, file: string) {
    const e = await this.playableEpisode(token, file)
    return storage.signedUrl(e.export!.storageKey!, EPISODE_URL_TTL_SECONDS)
  }

  /**
   * Size of an episode, for podcast apps that check it with HEAD first: the
   * storage link is signed for GET only, so HEAD is answered here instead.
   */
  async episodeSize(token: string, file: string) {
    const e = await this.playableEpisode(token, file)
    return e.export!.sizeBytes
  }

  private cover: Promise<Buffer> | null = null

  /** The feed's artwork (one image for every feed) */
  coverImage() {
    this.cover ??= readFile(COVER_FILE).catch((e) => {
      this.cover = null
      throw e
    })
    return this.cover
  }
}
