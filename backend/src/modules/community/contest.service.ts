import { CONTEST_MIN_HEARTS, CONTEST_PRIZE_MINUTES, CONTEST_SETTLE_DELAY_HOURS, CONTEST_VOTER_MIN_DAYS } from '../../config/constants.js'
import { sendEmail } from '../../utils/email.js'
import { contestWinEmail } from './community.emails.js'
import type { CommunityRepository, Standing } from './community.repository.js'
import { coverUrls, currentMonth, monthEnd, toItem } from './community.service.js'

/** Bangla and English have boards of their own; every other language shares one */
export const BOARDS = ['bn', 'en', 'other'] as const

// Leaders shown per board, and how long a board is reused before it's worked out again
const LEADERS = 10
const STANDINGS_TTL_MS = 60_000

/**
 * The monthly writing contest. Writers enter one writing a month; listeners
 * heart it once they've heard it. A day after the month ends (UTC), the top
 * three on each board with enough counted hearts get Expressive minutes that
 * never expire. Hearts count only from verified accounts at least a week old.
 */
export class ContestService {
  private readonly cache = new Map<string, { at: number; rows: Standing[] }>()

  constructor(private readonly communityRepository: CommunityRepository) {}

  private async leaders(month: string) {
    const cached = this.cache.get(month)
    if (cached && Date.now() - cached.at < STANDINGS_TTL_MS) return cached.rows
    const rows = await this.communityRepository.standings(month, monthEnd(month), CONTEST_VOTER_MIN_DAYS, LEADERS)
    this.cache.set(month, { at: Date.now(), rows })
    return rows
  }

  /** This month: theme, rules, prizes, each board's leaders, the viewer's entry; last month's winners; any prize the viewer hasn't seen */
  async view(viewerId: string) {
    const month = currentMonth()
    const [contest, standings, entry, last, wins] = await Promise.all([
      this.communityRepository.findContest(month),
      this.leaders(month),
      this.communityRepository.findEntry(viewerId, month),
      this.communityRepository.lastSettled(month),
      this.communityRepository.unseenWins(viewerId),
    ])
    return {
      month,
      theme: contest?.theme ?? null,
      endsAt: monthEnd(month),
      prizeMinutes: CONTEST_PRIZE_MINUTES,
      minHearts: CONTEST_MIN_HEARTS,
      voterMinDays: CONTEST_VOTER_MIN_DAYS,
      boards: BOARDS.map((id) => ({
        id,
        leaders: standings
          .filter((s) => s.board === id)
          .map((s) => ({ id: s.id, title: s.title, penName: s.penName ?? 'A listener', place: s.place, hearts: s.score, mine: s.userId === viewerId })),
      })),
      entry: entry ? toItem(entry, viewerId, undefined, await coverUrls([entry])) : null,
      lastMonth: last
        ? {
            month: last.month,
            theme: last.theme,
            winners: last.wins.map((w) => ({ board: w.board, place: w.place, title: w.title, penName: w.penName, hearts: w.hearts, minutes: Math.round(w.seconds / 60), publicationId: w.publicationId })),
          }
        : null,
      /** Prizes the viewer won and hasn't been told about in the app */
      wins: wins.map((w) => ({ id: w.id, month: w.month, board: w.board, place: w.place, title: w.title, minutes: Math.round(w.seconds / 60) })),
    }
  }

  markWinsSeen(userId: string) {
    return this.communityRepository.markWinsSeen(userId)
  }

  async setTheme(month: string, theme: string | null) {
    const row = await this.communityRepository.setTheme(month, theme || null)
    return { month: row.month, theme: row.theme }
  }

  /**
   * Hourly: gives the prizes of every month that ended a day ago or more, once,
   * and emails the winners. The day lets the team review anything reports hid
   * at the last minute; hearts given after the month ended never count.
   */
  async settleDue(now = Date.now()) {
    for (const month of await this.communityRepository.unsettledMonths(currentMonth())) {
      if (now < monthEnd(month).getTime() + CONTEST_SETTLE_DELAY_HOURS * 3_600_000) continue
      const rows = await this.communityRepository.standings(month, monthEnd(month), CONTEST_VOTER_MIN_DAYS, CONTEST_PRIZE_MINUTES.length)
      const wins = rows
        .filter((r) => r.score >= CONTEST_MIN_HEARTS)
        .map((r) => ({
          board: r.board,
          place: r.place,
          publicationId: r.id,
          userId: r.userId,
          title: r.title,
          penName: r.penName ?? '',
          hearts: r.score,
          seconds: CONTEST_PRIZE_MINUTES[r.place - 1] * 60,
        }))
      const given = await this.communityRepository.settle(month, wins)
      console.log(`[contest] ${month} settled: ${given.length} prize(s)`)
      await this.emailWinners(month, given).catch((e) => console.error(`[contest] winner emails for ${month} failed`, e))
    }
  }

  private async emailWinners(month: string, wins: { userId: string; place: number; title: string; seconds: number }[]) {
    if (!wins.length) return
    const users = new Map((await this.communityRepository.findEmails(wins.map((w) => w.userId))).map((u) => [u.id, u]))
    for (const win of wins) {
      const user = users.get(win.userId)
      if (user) await sendEmail({ to: user.email, ...contestWinEmail(month, win.place, win.title, Math.round(win.seconds / 60)) })
    }
  }
}
