import { APP_NAME, OTP_TTL_MINUTES } from '../../config/constants.js'

function codeEmail(heading: string, intro: string, code: string) {
  const html = `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 16px">${heading}</h2>
  <p style="margin:0 0 16px">${intro}</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:0 0 16px">${code}</p>
  <p style="margin:0;color:#555">This code expires in ${OTP_TTL_MINUTES} minutes. If you didn't request it, you can ignore this email.</p>
</div>`
  const text = `${intro}\n\n${code}\n\nThis code expires in ${OTP_TTL_MINUTES} minutes.`
  return { html, text }
}

export function verificationEmail(code: string) {
  return {
    subject: `${code} is your ${APP_NAME} verification code`,
    ...codeEmail('Verify your email', `Enter this code in the ${APP_NAME} app to verify your email:`, code),
  }
}

export function passwordResetEmail(code: string) {
  return {
    subject: `${code} is your ${APP_NAME} password reset code`,
    ...codeEmail('Reset your password', `Enter this code in the ${APP_NAME} app to reset your password:`, code),
  }
}
