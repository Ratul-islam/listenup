import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { env } from '../../config/env.js'
import { API_PREFIX } from '../../config/constants.js'
import { signFileToken, uploadTokenSubject } from './file-token.js'
import type { Storage } from './storage.js'

const root = path.resolve(env.STORAGE_LOCAL_DIR)

/** Resolves a key inside the storage root, rejecting path traversal */
export function localPath(key: string) {
  const full = path.resolve(root, key)
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid storage key')
  return full
}

const fileUrl = (key: string) => `${env.PUBLIC_URL}${API_PREFIX}/files/${key.split('/').map(encodeURIComponent).join('/')}`

export class LocalStorage implements Storage {
  async put(key: string, body: Buffer) {
    const file = localPath(key)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, body)
  }

  async putStream(key: string, body: Readable) {
    const file = localPath(key)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await pipeline(body, createWriteStream(file))
  }

  get(key: string) {
    return fs.readFile(localPath(key))
  }

  size(key: string) {
    return fs.stat(localPath(key)).then((s) => s.size, () => null)
  }

  exists(key: string) {
    return fs.access(localPath(key)).then(() => true, () => false)
  }

  async delete(key: string) {
    await fs.rm(localPath(key), { force: true })
  }

  async deletePrefix(prefix: string) {
    await fs.rm(localPath(prefix), { recursive: true, force: true })
  }

  async signedUrl(key: string, ttlSeconds: number) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds
    const sig = signFileToken(key, exp)
    return `${fileUrl(key)}?exp=${exp}&sig=${sig}`
  }

  /** Served by the files route's PUT handler, which checks type and size like S3 does */
  async signedUploadUrl(key: string, contentType: string, sizeBytes: number, ttlSeconds: number) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds
    const sig = signFileToken(uploadTokenSubject(key, contentType, sizeBytes), exp)
    return `${fileUrl(key)}?exp=${exp}&size=${sizeBytes}&sig=${sig}`
  }

  static openStream(key: string, range?: { start: number; end: number }) {
    return createReadStream(localPath(key), range)
  }

  static async stat(key: string) {
    return fs.stat(localPath(key))
  }
}
