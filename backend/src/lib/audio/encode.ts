import { Mp3Encoder } from '@breezystack/lamejs'

const FRAME = 1152

/** Raw 16-bit little-endian PCM → MP3 (mono speech at 64 kbps is ~0.5 MB per minute) */
export function pcmToMp3(pcm: Buffer, sampleRate: number, kbps = 64) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2))
  const encoder = new Mp3Encoder(1, sampleRate, kbps)
  const parts: Buffer[] = []
  // The encoder hands back Int8Array views (despite its types); wrap without copying
  const push = (out: ArrayBufferView) => out.byteLength && parts.push(Buffer.from(out.buffer, out.byteOffset, out.byteLength))
  for (let i = 0; i < samples.length; i += FRAME) push(encoder.encodeBuffer(samples.subarray(i, i + FRAME)))
  push(encoder.flush())
  return Buffer.concat(parts)
}

/** Reads "audio/pcm;rate=24000;channels=1" style headers */
export function pcmRate(contentType: string | null, fallback = 24_000) {
  const rate = Number(/rate=(\d+)/i.exec(contentType ?? '')?.[1])
  return Number.isFinite(rate) && rate > 0 ? rate : fallback
}
