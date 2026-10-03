import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '../config/env.js'

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

const isSmtpConfigured = Boolean(env.SMTP_USER && env.SMTP_PASS)

let transporter: Transporter | undefined

function getTransporter() {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  })
  return transporter
}

export const sendEmail = async ({ to, subject, html, text }: EmailOptions) => {
  if (!isSmtpConfigured) {
    // Dev fallback (production requires SMTP via env validation): print instead of sending
    console.info(`[email] SMTP not configured, printing instead\nTo: ${to}\nSubject: ${subject}\n${text ?? html}`)
    return
  }

  await getTransporter().sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    to,
    subject,
    html,
    text,
  })
}
