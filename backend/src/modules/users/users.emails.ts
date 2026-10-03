import { APP_NAME } from '../../config/constants.js'

export function accountClosedEmail(deleteAfter: Date) {
  const date = deleteAfter.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const html = `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 16px">Your ${APP_NAME} account is closed</h2>
  <p style="margin:0 0 16px">Your documents, audio and listening history will be permanently deleted on ${date}.</p>
  <p style="margin:0;color:#555">Changed your mind? Sign in to ${APP_NAME} before then and everything will be restored.</p>
</div>`
  const text = `Your ${APP_NAME} account is closed. Your documents, audio and listening history will be permanently deleted on ${date}. Sign in before then to restore everything.`
  return { subject: `Your ${APP_NAME} account is closed`, html, text }
}
