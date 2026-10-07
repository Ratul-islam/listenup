// Load generator for the ListenUp API: setup (imports), stress ramp, spike, and focused tests.
// Usage: node load.mjs <phase> ; results are appended as JSON lines to results.jsonl
import { createHmac, randomBytes } from 'node:crypto'
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs'

const DIR = new URL('.', import.meta.url).pathname
const API = 'http://127.0.0.1:8124/api/v1'
const SECRET = readFileSync(DIR + 'jwt-secret', 'utf8').trim()
const USERS = JSON.parse(readFileSync(DIR + 'load-users.json', 'utf8'))
const STATE = DIR + 'load-state.json'

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')
function token(user) {
  const now = Math.floor(Date.now() / 1000)
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, iat: now, exp: now + 3600 })}`
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`
}
const tokens = USERS.map(token)
const randomIp = () => `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let records = []
async function call(route, method, path, { user = 0, body, ip = randomIp(), timeoutMs = 60_000 } = {}) {
  const started = performance.now()
  let status = 0
  let data = null
  try {
    const res = await fetch(API + path, {
      method,
      headers: { authorization: `Bearer ${tokens[user]}`, 'x-forwarded-for': ip, ...(process.env.NO_GZIP ? {} : { 'accept-encoding': 'gzip' }), ...(body !== undefined && { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    status = res.status
    const text = await res.text()
    data = text ? JSON.parse(text).data : null
    records.push({ t: Date.now(), route, ms: performance.now() - started, status, bytes: text.length })
  } catch (e) {
    records.push({ t: Date.now(), route, ms: performance.now() - started, status: e.name === 'TimeoutError' ? -1 : 0 })
  }
  return { status, data }
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0)
function summarize(list, seconds) {
  const ms = list.map((r) => r.ms).sort((a, b) => a - b)
  const ok = list.filter((r) => r.status >= 200 && r.status < 400).length
  return {
    requests: list.length,
    rps: +(list.length / seconds).toFixed(1),
    okRps: +(ok / seconds).toFixed(1),
    errors: list.filter((r) => r.status === 0 || r.status === -1 || r.status >= 500).length,
    throttled: list.filter((r) => r.status === 429).length,
    timeouts: list.filter((r) => r.status === -1).length,
    p50: Math.round(pct(ms, 0.5)),
    p95: Math.round(pct(ms, 0.95)),
    p99: Math.round(pct(ms, 0.99)),
    max: Math.round(ms.at(-1) ?? 0),
  }
}
const byRoute = (list, seconds) => Object.fromEntries([...new Set(list.map((r) => r.route))].map((route) => [route, summarize(list.filter((r) => r.route === route), seconds)]))
const save = (name, result) => {
  appendFileSync(DIR + 'results.jsonl', JSON.stringify({ name, at: new Date().toISOString(), ...result }) + '\n')
  console.log(name, JSON.stringify(result.summary ?? result))
}

// ---------- the user mix ----------
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null
const pick = (weights) => {
  let r = Math.random() * weights.reduce((n, [, w]) => n + w, 0)
  for (const [k, w] of weights) if ((r -= w) < 0) return k
  return weights[0][0]
}
const MIX = [
  ['scripts', 10], ['shelf', 10], ['script', 15], ['audio', 25], ['progress', 20],
  ['usage', 5], ['pronunciations', 5], ['export', 5], ['pause', 3], ['stats', 2],
]
async function oneAction(vu) {
  const user = vu % USERS.length
  const doc = state.docs[user]
  const part = (Math.random() * doc.parts) | 0
  switch (pick(MIX)) {
    case 'scripts': return call('GET /documents?view=scripts', 'GET', '/documents?view=scripts', { user })
    case 'shelf': return call('GET /documents', 'GET', '/documents', { user })
    case 'script': return call('GET /documents/:id/script', 'GET', `/documents/${doc.id}/script`, { user })
    case 'audio': return call('GET …/parts/:i/audio', 'GET', `/documents/${doc.id}/parts/${part}/audio`, { user })
    case 'progress': return call('PUT …/progress', 'PUT', `/documents/${doc.id}/progress`, { user, body: { chunkIndex: part, offsetMs: 1000, listenedSec: 5, day: '2026-10-07' } })
    case 'usage': return call('GET /usage', 'GET', '/usage', { user })
    case 'pronunciations': return call('GET /pronunciations', 'GET', '/pronunciations', { user })
    case 'export': return call('GET …/export', 'GET', `/documents/${doc.id}/export`, { user })
    case 'pause': return call('PATCH …/parts/:i', 'PATCH', `/documents/${doc.id}/parts/${part}`, { user, body: { pauseAfterMs: [0, 500, 1000][(Math.random() * 3) | 0] } })
    case 'stats': return call('GET /listening/stats', 'GET', '/listening/stats?day=2026-10-07', { user })
  }
}

/** Closed-loop virtual users: each sends its next request as soon as the last one answers */
async function runStage(vus, seconds, label) {
  const until = Date.now() + seconds * 1000
  const start = records.length
  await Promise.all(Array.from({ length: vus }, async (_, vu) => {
    while (Date.now() < until) await oneAction(vu)
  }))
  return records.slice(start)
}

// ---------- phases ----------
const phase = process.argv[2]

if (phase === 'setup') {
  // Import storm: every user pastes a ~3,000-character script at once
  const para = 'The captain looked out over the stormy sea while the crew held on tight. Mira laughed from the mast, she had seen worse storms than this one. '
  const text = Array.from({ length: 10 }, (_, i) => `Scene ${i + 1}. ${para}${para}`).join('\n\n')
  const started = Date.now()
  const created = await Promise.all(USERS.map((_, user) => call('POST /documents (import)', 'POST', '/documents', { user, body: { from: 'text', title: `Script ${user}`, text, script: true }, timeoutMs: 120_000 })))
  const accepted = Date.now() - started
  const ids = created.map((c) => c.data?.document?.id)
  // Wait for the ingestion queue to finish them all
  let ready = 0
  const docs = new Array(USERS.length)
  while (Date.now() - started < 600_000) {
    ready = 0
    for (let user = 0; user < USERS.length; user++) {
      if (docs[user]) { ready++; continue }
      if (!ids[user]) continue
      const { data } = await call('GET /documents/:id (poll)', 'GET', `/documents/${ids[user]}`, { user })
      if (data?.document?.status === 'READY') { docs[user] = { id: ids[user], parts: data.document.chunkCount }; ready++ }
    }
    if (ready === USERS.length) break
    await sleep(1000)
  }
  const drained = Date.now() - started
  // One very long script (200,000 characters, ~480 parts) for user 0's heavy test
  const long = Array.from({ length: 140 }, (_, i) => `Chapter ${i + 1}. ${para.repeat(10)}`).join('\n\n').slice(0, 199_000)
  const big = await call('POST /documents (200k chars)', 'POST', '/documents', { user: 0, body: { from: 'text', title: 'Long script', text: long, script: true }, timeoutMs: 120_000 })
  const bigStart = Date.now()
  let bigDoc = null
  while (Date.now() - bigStart < 300_000) {
    const { data } = await call('poll big', 'GET', `/documents/${big.data.document.id}`, { user: 0 })
    if (data?.document?.status === 'READY') { bigDoc = { id: big.data.document.id, parts: data.document.chunkCount }; break }
    await sleep(1000)
  }
  writeFileSync(STATE, JSON.stringify({ docs, big: bigDoc }))
  save('import-storm', {
    summary: {
      imports: USERS.length,
      created: ids.filter(Boolean).length,
      allAcceptedMs: accepted,
      allReadyMs: drained,
      ready,
      createLatency: summarize(records.filter((r) => r.route === 'POST /documents (import)'), accepted / 1000),
      bigScript: bigDoc ? { parts: bigDoc.parts, readyMs: Date.now() - bigStart } : 'not ready',
    },
  })
}

if (phase === 'warm') {
  // Voice every part once, so later stages measure cached audio like a real shelf (mixed with some new parts)
  records = []
  await Promise.all(state.docs.map(async (doc, user) => {
    for (let part = 0; part < Math.min(doc.parts, 4); part++) await call('warm audio', 'GET', `/documents/${doc.id}/parts/${part}/audio`, { user })
  }))
  save('warm', { summary: summarize(records, 1) })
}

if (phase === 'stress' || phase === 'stress-100') {
  const stages = phase === 'stress' ? [10, 25, 50, 100, 200, 400] : process.env.STAGES ? process.env.STAGES.split(',').map(Number) : [100]
  const out = []
  for (const vus of stages) {
    records = []
    const list = await runStage(vus, 30, `stress-${vus}`)
    const s = summarize(list, 30)
    out.push({ vus, ...s })
    console.log(`stress ${vus} VUs`, JSON.stringify(s))
    if (vus === 100) writeFileSync(DIR + 'routes-100.json', JSON.stringify(byRoute(list, 30)))
    await sleep(5000)
  }
  save(phase, { summary: out })
}

if (phase === 'spike') {
  records = []
  const started = Date.now()
  const base = runStage(20, 90, 'base')
  await sleep(30_000)
  await runStage(500, 20, 'spike')
  await base
  // 5-second windows across the whole run
  const windows = []
  for (let t = 0; t < 90; t += 5) {
    const list = records.filter((r) => r.t >= started + t * 1000 && r.t < started + (t + 5) * 1000)
    windows.push({ from: t, ...summarize(list, 5) })
  }
  save('spike', { summary: windows })
}

if (phase === 'big') {
  records = []
  const { id } = state.big
  const started = Date.now()
  await Promise.all(Array.from({ length: 20 }, async () => {
    for (let i = 0; i < 5; i++) await call('GET big script', 'GET', `/documents/${id}/script`, { user: 0 })
  }))
  const fetches = records.slice()
  const s1 = summarize(fetches, (Date.now() - started) / 1000)
  records = []
  const exp = await call('GET big export status', 'GET', `/documents/${id}/export`, { user: 0 })
  const expRec = records[0]
  records = []
  const rp = await call('POST big replace preview', 'POST', `/documents/${id}/replace`, { user: 0, body: { find: 'Mira', replace: 'Meera' } })
  const rpRec = records[0]
  save('big-script', {
    summary: {
      parts: state.big.parts,
      scriptFetch20x5: s1,
      scriptStatuses: [...new Set(fetches.map((r) => r.status))],
      scriptPayloadKb: Math.round((fetches[0]?.bytes ?? 0) / 1024),
      exportStatus: { http: expRec.status, ms: Math.round(expRec.ms), partsToVoice: exp.data?.export?.voicing?.partsToVoice },
      replacePreview: { http: rpRec.status, ms: Math.round(rpRec.ms), matches: rp.data?.matches, parts: rp.data?.parts?.length },
    },
  })
}

if (phase === 'login') {
  records = []
  const started = Date.now()
  await Promise.all(USERS.slice(0, 100).map((u) => fetchLogin(u.email)))
  save('login-storm', { summary: summarize(records, (Date.now() - started) / 1000) })
}
async function fetchLogin(email) {
  const started = performance.now()
  const res = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': randomIp() }, body: JSON.stringify({ email, password: 'load-pass-123' }) }).catch(() => null)
  records.push({ t: Date.now(), route: 'login', ms: performance.now() - started, status: res?.status ?? 0 })
  await res?.text()
}

if (phase === 'ratelimit') {
  // Same address: the audio route allows 120 a minute
  const doc = state.docs[1]
  records = []
  const ip = '203.0.113.7'
  for (let i = 0; i < 130; i++) await call('same ip', 'GET', `/documents/${doc.id}/parts/0/audio`, { user: 1, ip })
  const same = records.filter((r) => r.status === 429).length
  // A new X-Forwarded-For value on every request
  records = []
  for (let i = 0; i < 130; i++) await call('spoofed ip', 'GET', `/documents/${doc.id}/parts/0/audio`, { user: 1, ip: `203.0.113.7, ${randomIp()}`.split(', ').reverse().join(', ') })
  const spoofed = records.filter((r) => r.status === 429).length
  save('rate-limit', { summary: { sameAddress429s: same, spoofedForwardedFor429s: spoofed } })
}
