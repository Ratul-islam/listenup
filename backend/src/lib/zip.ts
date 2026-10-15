import zlib from 'node:zlib'
import { AppError } from '../utils/AppError.js'

/** How much a ZIP (EPUB, DOCX) may unpack to */
export interface ZipLimits {
  maxEntries: number
  /** Bytes one file inside may unpack to */
  maxEntryBytes: number
  /** Bytes everything unpacked may come to, together */
  maxTotalBytes: number
}

interface Entry {
  name: string
  method: number
  compressedSize: number
  size: number
  dataStart: number
}

const EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06])
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const MAX16 = 0xffff
const MAX32 = 0xffffffff

// "corrupt" makes ingestion treat it as a problem with the file, not worth retrying
const corrupt = (why: string) => new Error(`corrupt zip: ${why}`)
const tooBig = () =>
  new AppError('This file is too big to read once it’s unpacked. Try splitting it into smaller files.', 422, 'FILE_TOO_LARGE')

/**
 * The entries a ZIP lists, read the way JSZip (and mammoth, through it) reads
 * them: the central directory found from the last end record, then each
 * file's local header for where its data starts. Anything JSZip would read
 * differently (ZIP64, data stuck in front, encryption) is refused, so a file
 * that passes here unpacks to the same bytes there.
 */
function readEntries(buf: Buffer, maxEntries: number): Entry[] {
  const end = buf.lastIndexOf(EOCD)
  if (end < 0 || end + 22 > buf.length) throw corrupt('no end of central directory')
  const count = buf.readUInt16LE(end + 10)
  const dirSize = buf.readUInt32LE(end + 12)
  const dirOffset = buf.readUInt32LE(end + 16)
  if (count === MAX16 || dirSize === MAX32 || dirOffset === MAX32) throw corrupt('ZIP64 is not supported')
  if (dirOffset + dirSize !== end) throw corrupt('central directory is not where it says')
  if (count > maxEntries) throw tooBig()

  const entries: Entry[] = []
  let p = dirOffset
  while (p < end) {
    if (p + 46 > end || buf.readUInt32LE(p) !== CENTRAL) throw corrupt('bad central directory entry')
    if (entries.length >= maxEntries) throw tooBig()
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLength = buf.readUInt16LE(p + 28)
    const extraLength = buf.readUInt16LE(p + 30)
    const commentLength = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    if (flags & 1) throw corrupt('encrypted')
    if (method !== 0 && method !== 8) throw corrupt(`compression method ${method}`)
    if (compressedSize === MAX32 || size === MAX32 || localOffset === MAX32) throw corrupt('ZIP64 is not supported')
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength)

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL) throw corrupt('bad local header')
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28)
    if (dataStart + compressedSize > buf.length) throw corrupt('entry runs past the end')

    entries.push({ name, method, compressedSize, size, dataStart })
    p += 46 + nameLength + extraLength + commentLength
  }
  if (p !== end) throw corrupt('central directory size is wrong')
  return entries
}

/** One entry, unpacked; throws once it passes `limit` bytes, whatever size the file claims */
function unpack(buf: Buffer, entry: Entry, limit: number) {
  const data = buf.subarray(entry.dataStart, entry.dataStart + entry.compressedSize)
  if (entry.method === 0) {
    if (data.length > limit) throw tooBig()
    return data
  }
  try {
    return zlib.inflateRawSync(data, { maxOutputLength: Math.max(1, limit) })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw tooBig()
    throw corrupt((e as Error).message)
  }
}

/** Counts what an entry unpacks to without keeping it; throws once it passes `limit` */
function measure(buf: Buffer, entry: Entry, limit: number) {
  const data = buf.subarray(entry.dataStart, entry.dataStart + entry.compressedSize)
  if (entry.method === 0) {
    if (data.length > limit) throw tooBig()
    return Promise.resolve(data.length)
  }
  return new Promise<number>((resolve, reject) => {
    const inflate = zlib.createInflateRaw()
    let size = 0
    inflate.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        inflate.destroy()
        reject(tooBig())
      }
    })
    inflate.on('error', (e) => reject(corrupt(e.message)))
    inflate.on('end', () => resolve(size))
    inflate.end(data)
  })
}

/**
 * A ZIP whose entries are unpacked one at a time, each with a hard ceiling, and
 * all of them together with another. JSZip trusts the sizes a file claims, so a
 * few kilobytes could otherwise unpack to gigabytes.
 */
export function openZip(buffer: Buffer, limits: ZipLimits) {
  const entries = readEntries(buffer, limits.maxEntries)
  // A name listed twice: JSZip keeps the last, and so does this
  const byName = new Map(entries.map((e) => [e.name, e]))
  let used = 0
  const room = () => Math.min(limits.maxEntryBytes, limits.maxTotalBytes - used)

  return {
    /** The entry's bytes, or null if there's no such entry */
    read(name: string): Buffer | null {
      const entry = byName.get(name)
      if (!entry) return null
      const data = unpack(buffer, entry, room())
      used += data.length
      return data
    },
    /** Unpacks every entry once, keeping nothing: proves the whole file fits before another library opens it */
    async checkAll() {
      for (const entry of entries) used += await measure(buffer, entry, room())
    },
  }
}
