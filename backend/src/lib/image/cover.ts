import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AppError } from '../../utils/AppError.js'

// A cover as it's kept: a book's shape (5:7), small enough to load fast in a list
export const COVER_WIDTH = 600
export const COVER_HEIGHT = 840
/** The largest picture taken in, before it's made smaller */
export const COVER_MAX_BYTES = 6 * 1024 * 1024
// More pixels than any phone camera's photo: a file claiming more is refused before it's opened
const MAX_PIXELS = 64_000_000
const CONVERT_TIMEOUT_MS = 20_000

type Format = 'jpeg' | 'png' | 'webp'

const unreadable = () => new AppError('We couldn’t read that picture. Choose a JPEG or PNG.', 400, 'COVER_UNREADABLE')

/** What kind of picture this is, from its first bytes (never from what the sender says) */
function formatOf(image: Buffer): Format | null {
  if (image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) return 'jpeg'
  if (image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (image.subarray(0, 4).toString('latin1') === 'RIFF' && image.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  return null
}

/** Width and height as the file states them, or null if they can't be found */
function sizeOf(image: Buffer, format: Format): { width: number; height: number } | null {
  if (format === 'png') return image.length >= 24 ? { width: image.readUInt32BE(16), height: image.readUInt32BE(20) } : null
  if (format === 'webp') {
    const kind = image.subarray(12, 16).toString('latin1')
    if (image.length < 30) return null
    if (kind === 'VP8X') return { width: image.readUIntLE(24, 3) + 1, height: image.readUIntLE(27, 3) + 1 }
    if (kind === 'VP8 ') return { width: image.readUInt16LE(26) & 0x3fff, height: image.readUInt16LE(28) & 0x3fff }
    if (kind === 'VP8L') {
      const bits = image.readUInt32LE(21)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    return null
  }
  // JPEG: walk its segments to the frame header, which holds the size
  for (let at = 2; at + 9 < image.length; ) {
    if (image[at] !== 0xff) return null
    const marker = image[at + 1]
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: image.readUInt16BE(at + 7), height: image.readUInt16BE(at + 5) }
    }
    at += 2 + image.readUInt16BE(at + 2)
  }
  return null
}

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let log = ''
    ffmpeg.stderr.on('data', (d: Buffer) => (log = (log + d.toString()).slice(-600)))
    const timer = setTimeout(() => ffmpeg.kill('SIGKILL'), CONVERT_TIMEOUT_MS)
    ffmpeg.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      // Not a problem with the picture: the server is missing the tool
      if (e.code === 'ENOENT') {
        console.error('[cover] ffmpeg is not installed, so covers can’t be made')
        reject(new AppError('Covers aren’t set up on the server yet. Publish without one for now.', 503, 'COVER_UNAVAILABLE'))
      } else reject(e)
    })
    ffmpeg.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve()
      console.warn(`[cover] ffmpeg couldn’t read a picture: ${log.trim()}`)
      reject(unreadable())
    })
  })
}

/**
 * A picture from a phone as a cover: checked to be a real JPEG, PNG or WebP of
 * a sane size, then cut to a book's shape from its middle, made small, and
 * written again as a JPEG. Writing it again drops everything else the file
 * carried (where and when the photo was taken, the camera).
 */
export async function toCover(image: Buffer): Promise<Buffer> {
  if (image.length > COVER_MAX_BYTES) throw new AppError('That picture is too large. Choose one under 6 MB.', 400, 'COVER_TOO_LARGE')
  const format = formatOf(image)
  const size = format && sizeOf(image, format)
  if (!format || !size || size.width < 1 || size.height < 1) throw unreadable()
  if (size.width * size.height > MAX_PIXELS) throw new AppError('That picture is too large. Choose a smaller one.', 400, 'COVER_TOO_LARGE')
  if (size.width < 200 || size.height < 200) throw new AppError('That picture is too small to be a cover. Choose a larger one.', 400, 'COVER_TOO_SMALL')

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cover-'))
  try {
    const source = path.join(dir, 'in')
    const made = path.join(dir, 'cover.jpg')
    await fs.writeFile(source, image)
    await run([
      '-hide_banner',
      '-loglevel',
      'error',
      // Read it only as the kind of picture its first bytes say it is, never as anything else ffmpeg understands
      '-f',
      `${format}_pipe`,
      '-i',
      source,
      '-vf',
      `scale=${COVER_WIDTH}:${COVER_HEIGHT}:force_original_aspect_ratio=increase,crop=${COVER_WIDTH}:${COVER_HEIGHT},format=yuvj420p`,
      '-frames:v',
      '1',
      '-map_metadata',
      '-1',
      '-q:v',
      '4',
      '-f',
      'mjpeg',
      '-y',
      made,
    ])
    return await fs.readFile(made)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}
