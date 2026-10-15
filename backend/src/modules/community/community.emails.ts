import { APP_NAME } from '../../config/constants.js'

const PLACES = ['', '1st', '2nd', '3rd']

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** "October 2026" */
export const monthName = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function contestWinEmail(month: string, place: number, title: string, minutes: number) {
  const when = monthName(month)
  const subject = `You came ${PLACES[place]} in ${APP_NAME}'s ${when} writing contest`
  const html = `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 16px">You came ${PLACES[place]}!</h2>
  <p style="margin:0 0 16px">Listeners loved “${escapeHtml(title)}” in ${when}'s writing contest.</p>
  <p style="margin:0 0 16px">We've added <strong>${minutes} Expressive minutes</strong> to your account. They never expire.</p>
  <p style="margin:0;color:#555">Open ${APP_NAME} to see this month's contest.</p>
</div>`
  const text = `You came ${PLACES[place]} in ${when}'s writing contest with "${title}". We've added ${minutes} Expressive minutes to your account; they never expire.`
  return { subject, html, text }
}
