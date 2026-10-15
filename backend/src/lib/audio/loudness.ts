import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** A loudness to finish audio at: integrated loudness in LUFS, and the highest true peak in dB */
export interface LoudnessTarget {
  lufs: number
  peakDb: number
}

// A 3-hour script takes well under a minute a pass on one core
const PASS_TIMEOUT_MS = 10 * 60_000
// The finished file's bitrate. Encoding adds peaks: about 4 dB at 48 kbps, 1.5 to 2.5 at 64 and about 1 at 96
// (a 4.5-minute export, Oct 2026), so a finished file is a little bigger than a plain export
const FINISH_KBPS = 96
// Peaks are first held this far under the ceiling, for what the encoding adds
const ENCODE_HEADROOM_DB = 1.5
// Speech at 24 kHz peaks about 3 dB higher between its samples than on them, so it's limited at four times the rate, where those peaks are
const LIMIT_RATE = 96_000
// Close enough: the platforms allow ±1 (Apple) or simply turn louder files down (YouTube)
const LUFS_TOLERANCE = 0.5
// After encoding, a smaller shortfall is worth one more pass
const ENCODE_LOSS_TOLERANCE = 0.3

function ffmpeg(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-nostats', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    let log = ''
    child.stderr.on('data', (d: Buffer) => (log = (log + d.toString()).slice(-8000)))
    const timer = setTimeout(() => child.kill('SIGKILL'), PASS_TIMEOUT_MS)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(log)
      else reject(new Error(`ffmpeg exited with ${code}: ${log.slice(-400)}`))
    })
  })
}

/** Integrated loudness and true peak of a file, as EBU R128 measures them */
async function measureLoudness(file: string) {
  const log = await ffmpeg(['-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'])
  const summary = log.slice(log.lastIndexOf('Summary:'))
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1])
  const peakDb = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1])
  if (!Number.isFinite(lufs)) throw new Error(`couldn't measure the loudness: ${summary.slice(0, 200)}`)
  return { lufs, peakDb: Number.isFinite(peakDb) ? peakDb : -Infinity }
}

/**
 * An MP3 at a platform's loudness (EBU R128, as YouTube, Spotify and Apple measure it). It's
 * turned up or down by one steady amount, which keeps the voice's own rise and fall, and the
 * peaks that would go over the ceiling are held back by a quick limiter. Limiting costs a little
 * loudness and encoding adds a little peak, so each is measured and made up for once. The sample
 * rate and timing stay as they were, so subtitles made for the joined file still fit. Null when
 * ffmpeg isn't installed (the file is then kept as it was).
 */
export async function finishLoudness(mp3: Buffer, { lufs, peakDb }: LoudnessTarget, sampleRate: number): Promise<{ audio: Buffer; lufs: number; peakDb: number } | null> {
  const id = randomUUID()
  const file = (name: string) => path.join(tmpdir(), `finish-${id}-${name}`)
  const [input, levelled, output] = [file('in.mp3'), file('levelled.wav'), file('out.mp3')]
  const level = (gainDb: number, ceilingDb: number) =>
    ffmpeg([
      '-y',
      '-i',
      input,
      '-af',
      `volume=${gainDb.toFixed(2)}dB,aresample=${LIMIT_RATE},alimiter=limit=${(10 ** (ceilingDb / 20)).toFixed(4)}:attack=1:release=40:level=false,aresample=${sampleRate}`,
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      levelled,
    ])
  const encode = () => ffmpeg(['-y', '-i', levelled, '-c:a', 'libmp3lame', '-b:a', `${FINISH_KBPS}k`, output])
  try {
    await writeFile(input, mp3)
    const before = await measureLoudness(input)
    let gain = lufs - before.lufs
    let ceiling = peakDb - ENCODE_HEADROOM_DB
    await level(gain, ceiling)
    // The limiter takes a little loudness with the peaks: made up once
    const limited = await measureLoudness(levelled)
    if (Math.abs(lufs - limited.lufs) > LUFS_TOLERANCE) {
      gain += lufs - limited.lufs
      await level(gain, ceiling)
    }
    await encode()
    let after = await measureLoudness(output)
    // The encoding takes about half a decibel more: made up once
    if (lufs - after.lufs > ENCODE_LOSS_TOLERANCE) {
      gain += lufs - after.lufs
      await level(gain, ceiling)
      await encode()
      after = await measureLoudness(output)
    }
    // The encoding put a peak over the ceiling: limited that much lower, once
    if (after.peakDb > peakDb) {
      ceiling -= after.peakDb - peakDb + 0.2
      await level(gain, ceiling)
      await encode()
      after = await measureLoudness(output)
    }
    return { audio: await readFile(output), lufs: after.lufs, peakDb: after.peakDb }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('[loudness] ffmpeg is not installed, so exports keep their own loudness')
      return null
    }
    throw e
  } finally {
    await Promise.all([input, levelled, output].map((f) => rm(f, { force: true })))
  }
}
