// Prints markdown tables from results.jsonl, stats.log and phases.log for the report
import { readFileSync, existsSync } from 'node:fs'
const DIR = new URL('.', import.meta.url).pathname
const results = readFileSync(DIR + 'results.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const stats = readFileSync(DIR + 'stats.log', 'utf8').trim().split('\n').map((l) => {
  const [ts, cpu, mem] = l.split(' ')
  return { t: Number(ts), cpu: parseFloat(cpu), mem: parseFloat(mem) * (/GiB/.test(mem) ? 1024 : 1) }
}).filter((s) => !Number.isNaN(s.cpu))
const phases = existsSync(DIR + 'phases.log') ? readFileSync(DIR + 'phases.log', 'utf8').trim().split('\n').map((l) => { const [t, , name] = l.split(' '); return { t: Number(t), name } }) : []
const last = (name) => results.filter((r) => r.name === name).at(-1)

const phaseWindow = (name) => {
  const i = phases.findIndex((p) => p.name === name)
  return i < 0 ? null : [phases[i].t, phases[i + 1]?.t ?? Infinity]
}
const resource = (name) => {
  const w = phaseWindow(name)
  if (!w) return ''
  const list = stats.filter((s) => s.t >= w[0] && s.t < w[1])
  if (!list.length) return ''
  const max = (k) => Math.max(...list.map((s) => s[k]))
  const avg = (k) => list.reduce((n, s) => n + s[k], 0) / list.length
  // docker reports CPU as % of one core; the container may use 50%
  return `CPU avg ${(avg('cpu') / 50 * 100).toFixed(0)}% / peak ${(max('cpu') / 50 * 100).toFixed(0)}% of its 0.5-core limit; memory peak ${max('mem').toFixed(0)} MiB of 512`
}

const s = last('stress')
if (s) {
  console.log('\n### Stress\n')
  console.log('| Users at once | Requests/s | p50 ms | p95 ms | p99 ms | Max ms | Errors | Timeouts |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const r of s.summary) console.log(`| ${r.vus} | ${r.okRps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${r.errors} | ${r.timeouts} |`)
  console.log('\n' + resource('stress'))
}
if (existsSync(DIR + 'routes-100.json')) {
  const routes = JSON.parse(readFileSync(DIR + 'routes-100.json', 'utf8'))
  console.log('\n### Per endpoint at 100 users\n')
  console.log('| Endpoint | Requests/s | p50 ms | p95 ms | p99 ms | Errors |')
  console.log('|---|---|---|---|---|---|')
  for (const [route, r] of Object.entries(routes).sort((a, b) => b[1].p95 - a[1].p95)) console.log(`| ${route} | ${r.okRps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.errors} |`)
}
const sp = last('spike')
if (sp) {
  console.log('\n### Spike (20 users, 500 users from 30 s to 50 s, back to 20)\n')
  console.log('| Seconds | Requests/s | p50 ms | p95 ms | p99 ms | Errors | Timeouts |')
  console.log('|---|---|---|---|---|---|---|')
  for (const w of sp.summary) console.log(`| ${w.from}–${w.from + 5} | ${w.okRps} | ${w.p50} | ${w.p95} | ${w.p99} | ${w.errors} | ${w.timeouts} |`)
  console.log('\n' + resource('spike'))
}
for (const name of ['import-storm', 'warm', 'big-script', 'login-storm', 'rate-limit']) {
  const r = results.filter((x) => x.name === name)
  for (const x of r) console.log(`\n### ${name} (${x.at})\n\n\`\`\`json\n${JSON.stringify(x.summary, null, 1)}\n\`\`\`\n${resource(name === 'import-storm' ? 'setup' : name === 'big-script' ? 'big' : name === 'login-storm' ? 'login' : name === 'rate-limit' ? 'ratelimit' : name)}`)
}
