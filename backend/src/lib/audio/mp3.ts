// MPEG audio frame header tables (layer III)
const BITRATES = {
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] } as Record<number, number[]>

interface Frame {
  offset: number
  length: number
  samples: number
  sampleRate: number
}

function readFrame(buf: Buffer, offset: number): Frame | null {
  if (offset + 4 > buf.length || buf[offset] !== 0xff || (buf[offset + 1] & 0xe0) !== 0xe0) return null
  const version = (buf[offset + 1] >> 3) & 0x03 // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (buf[offset + 1] >> 1) & 0x03 // 1 = layer III
  const bitrateIndex = buf[offset + 2] >> 4
  const rateIndex = (buf[offset + 2] >> 2) & 0x03
  const padding = (buf[offset + 2] >> 1) & 0x01
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null

  const bitrate = (version === 3 ? BITRATES.v1 : BITRATES.v2)[bitrateIndex] * 1000
  const sampleRate = SAMPLE_RATES[version][rateIndex]
  const samples = version === 3 ? 1152 : 576
  const length = Math.floor(((samples / 8) * bitrate) / sampleRate) + padding
  return length > 4 ? { offset, length, samples, sampleRate } : null
}

function id3Size(buf: Buffer) {
  if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return 0
  return 10 + (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f))
}

/** Every frame in the buffer, after any ID3 tag, resyncing over junk */
function walkFrames(input: Buffer) {
  let offset = id3Size(input)
  const frames: Frame[] = []
  while (offset < input.length) {
    const frame = readFrame(input, offset)
    if (!frame) {
      offset++ // resync on junk
      continue
    }
    frames.push(frame)
    offset += frame.length
  }
  // A leading Xing/Info frame is metadata, not audio
  const first = frames[0] && input.subarray(frames[0].offset, frames[0].offset + frames[0].length)
  const hasInfo = !!first && (first.includes('Xing') || first.includes('Info'))
  return { frames: hasInfo ? frames.slice(1) : frames, hasInfo }
}

/**
 * Just the audio frames of an MP3 (no ID3 tag, no Xing/Info frame), so clips
 * in the same format can be joined into one playable file.
 */
export function audioFrames(input: Buffer) {
  const { frames } = walkFrames(input)
  if (!frames.length) return Buffer.alloc(0)
  const last = frames.at(-1)!
  return input.subarray(frames[0].offset, last.offset + last.length)
}

/** Sample rate of an MP3's first audio frame (null if it has none) */
export function mp3SampleRate(input: Buffer) {
  return walkFrames(input).frames[0]?.sampleRate ?? null
}

/**
 * Measures an MP3 by walking its frames, and drops a leading Xing/Info
 * frame. Some providers write a wrong frame count there, which makes players
 * report (and seek by) the wrong duration.
 */
export function normalizeMp3(input: Buffer) {
  const { frames, hasInfo } = walkFrames(input)
  if (!frames.length) return { audio: input, durationMs: 0 }
  const durationMs = Math.round(frames.reduce((ms, f) => ms + (f.samples / f.sampleRate) * 1000, 0))
  const audio = hasInfo ? Buffer.concat(frames.map((f) => input.subarray(f.offset, f.offset + f.length))) : input
  return { audio, durationMs }
}
