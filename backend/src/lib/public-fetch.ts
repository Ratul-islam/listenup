import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { pipeline, type Readable } from 'node:stream'
import zlib from 'node:zlib'
import { AppError } from '../utils/AppError.js'

/**
 * Addresses a link from a user must never reach: this machine, private and
 * carrier networks, cloud metadata (169.254.169.254), and reserved ranges.
 * BlockList also matches IPv4 written as IPv6 (::ffff:10.0.0.1); the IPv6
 * ranges that carry an IPv4 address inside (NAT64, 6to4, Teredo, the old
 * IPv4-compatible form) are refused whole.
 */
const BLOCKED = new net.BlockList()
for (const [subnet, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) BLOCKED.addSubnet(subnet, prefix, 'ipv4')
for (const [subnet, prefix] of [
  ['::', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) BLOCKED.addSubnet(subnet, prefix, 'ipv6')

export const isBlockedAddress = (address: string) => {
  const family = net.isIP(address)
  return family === 0 || BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

const PORTS = new Set(['', '80', '443', '8080', '8443'])
const MAX_REDIRECTS = 5

const privateNetwork = () => new AppError('That link points to a private network', 400, 'INVALID_URL')

/**
 * DNS lookup for the connection itself. Checking the name first and then letting
 * the request resolve it again would let a name answer differently the second
 * time (DNS rebinding); here the address that's checked is the one connected to.
 */
const publicLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0)
    if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} is a private address`), { code: 'EPRIVATE' }), '', 0)
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses)
    callback(null, addresses[0].address, addresses[0].family)
  })
}

function assertAllowed(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new AppError('Only http and https links are supported', 400, 'INVALID_URL')
  if (url.username || url.password || !PORTS.has(url.port)) throw new AppError('That link isn’t a normal web address', 400, 'INVALID_URL')
  // Literal addresses skip the lookup, so they're checked here ([::1] keeps its brackets in URL)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && isBlockedAddress(host)) throw privateNetwork()
}

function request(url: URL, headers: Record<string, string>, signal: AbortSignal) {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const req = client.request(url, { method: 'GET', headers, lookup: publicLookup, agent: false, signal }, resolve)
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPRIVATE') reject(privateNetwork())
      else if (err.code === 'ENOTFOUND' || err.code === 'EAI_NONAME') reject(new AppError("That website couldn't be found", 400, 'URL_UNREACHABLE'))
      else reject(err)
    })
    req.end()
  })
}

/** The body, unpacked, refusing to hold more than `maxBytes` (a small gzip can unpack to gigabytes) */
async function readBody(res: http.IncomingMessage, maxBytes: number) {
  const encoding = (res.headers['content-encoding'] ?? '').toLowerCase().trim()
  const unpack = encoding === 'gzip' || encoding === 'x-gzip' ? zlib.createGunzip()
    : encoding === 'deflate' ? zlib.createInflate()
    : encoding === 'br' ? zlib.createBrotliDecompress()
    : null
  const body: Readable = unpack ? pipeline(res, unpack, () => {}) : res
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of body) {
    size += chunk.length
    if (size > maxBytes) {
      res.destroy()
      throw new AppError('That page is too large to import', 400, 'URL_TOO_LARGE')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * GET for a link a user gave: public addresses only (every redirect checked
 * too), a time limit, and a size limit on what comes back.
 */
export async function fetchPublic(start: URL, { accept, maxBytes, timeoutMs, userAgent }: { accept: string; maxBytes: number; timeoutMs: number; userAgent: string }) {
  const signal = AbortSignal.timeout(timeoutMs)
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertAllowed(url)
    const res = await request(url, { 'User-Agent': userAgent, Accept: accept, 'Accept-Encoding': 'gzip, deflate, br' }, signal)
    const status = res.statusCode ?? 0
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume()
      url = new URL(res.headers.location, url)
      continue
    }
    const contentLength = Number(res.headers['content-length'])
    if (contentLength > maxBytes) {
      res.destroy()
      throw new AppError('That page is too large to import', 400, 'URL_TOO_LARGE')
    }
    return {
      status,
      contentType: res.headers['content-type'] ?? '',
      finalUrl: url,
      /** Reads the body; call it once, or `discard` instead */
      body: () => readBody(res, maxBytes),
      discard: () => res.destroy(),
    }
  }
  throw new AppError('Too many redirects', 400, 'URL_UNREACHABLE')
}
