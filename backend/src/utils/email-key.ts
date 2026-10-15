// Gmail ignores dots in the name: j.o.h.n@gmail.com is john@gmail.com
const GMAIL = 'gmail.com'

/** Gmail and googlemail.com, where Google makes every dot and "+tag" spelling one inbox */
export const isGmail = (email: string) => /@(gmail|googlemail)\.com$/i.test(email.trim())

/**
 * One key per real inbox: lower case, a "+tag" dropped, googlemail.com read as
 * gmail.com, and Gmail's dots dropped. "john.doe+1@gmail.com" and
 * "johndoe@googlemail.com" both give "johndoe@gmail.com". It stops one person
 * opening many accounts for rewards; signing in still uses the address as typed.
 * The migration 20261015120000_security_fixes applies the same rule in SQL.
 * It's for spotting duplicate accounts only: outside Gmail a "+tag" may be a
 * different person's mailbox, so it never decides whose account someone gets.
 */
export function emailKey(email: string) {
  const address = email.trim().toLowerCase()
  const at = address.lastIndexOf('@')
  if (at < 1) return address
  let local = address.slice(0, at)
  let domain = address.slice(at + 1)
  local = local.split('+')[0] || local
  if (domain === 'googlemail.com') domain = GMAIL
  if (domain === GMAIL) local = local.replaceAll('.', '') || local
  return `${local}@${domain}`
}
