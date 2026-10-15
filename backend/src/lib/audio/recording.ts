import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AppError } from '../../utils/AppError.js'

// What Google asks for in a voice recording: 24 kHz, mono, 16-bit WAV
const RATE = 24_000
const CONVERT_TIMEOUT_MS = 30_000
// Quieter than this at its loudest, and nothing was really recorded (a muted or blocked microphone)
const MIN_PEAK = 0.05

export interface SpeechRecording {
  wav: Buffer
  durationSec: number
}

const unreadable = () => new AppError('We couldn’t read that recording. Record it again.', 400, 'RECORDING_UNREADABLE')

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let log = ''
    ffmpeg.stderr.on('data', (d: Buffer) => (log = (log + d.toString()).slice(-600)))
    const timer = setTimeout(() => ffmpeg.kill('SIGKILL'), CONVERT_TIMEOUT_MS)
    ffmpeg.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      // Not a problem with the recording: the server is missing the tool
      if (e.code === 'ENOENT') {
        console.error('[recording] ffmpeg is not installed, so recordings can’t be converted')
        reject(new AppError('Recording isn’t set up on the server yet.', 503, 'RECORDING_UNAVAILABLE'))
      } else reject(e)
    })
    ffmpeg.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve()
      console.warn(`[recording] ffmpeg couldn’t convert a recording: ${log.trim()}`)
      reject(unreadable())
    })
  })
}

/** The samples of a WAV file (its "data" chunk): 16-bit PCM, as toSpeechWav() makes it */
export function samplesOf(wav: Buffer) {
  if (wav.subarray(0, 4).toString('latin1') !== 'RIFF' || wav.subarray(8, 12).toString('latin1') !== 'WAVE') throw unreadable()
  for (let at = 12; at + 8 <= wav.length; ) {
    const size = wav.readUInt32LE(at + 4)
    if (wav.subarray(at, at + 4).toString('latin1') === 'data') return wav.subarray(at + 8, Math.min(at + 8 + size, wav.length))
    at += 8 + size + (size % 2)
  }
  throw unreadable()
}

/**
 * A phone's recording (AAC in an .m4a, or anything else ffmpeg reads) as the
 * WAV a voice is made from, cut to `maxSec`. Refuses one with no sound in it.
 */
export async function toSpeechWav(recording: Buffer, maxSec: number): Promise<SpeechRecording> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'recording-'))
  try {
    // From a file, not a pipe: an .m4a keeps its index at the end
    const input = path.join(dir, 'in')
    const output = path.join(dir, 'out.wav')
    await fs.writeFile(input, recording)
    await run(['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-t', String(maxSec), '-ac', '1', '-ar', String(RATE), '-c:a', 'pcm_s16le', '-map_metadata', '-1', '-bitexact', '-f', 'wav', output])
    const wav = await fs.readFile(output)
    const samples = samplesOf(wav)
    let peak = 0
    for (let i = 0; i + 1 < samples.length; i += 2) peak = Math.max(peak, Math.abs(samples.readInt16LE(i)))
    if (peak / 32768 < MIN_PEAK) throw new AppError('We couldn’t hear anything in that recording. Check the microphone and record it again.', 400, 'RECORDING_SILENT')
    return { wav, durationSec: samples.length / 2 / RATE }
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}
