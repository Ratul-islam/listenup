import { CHARS_PER_SECOND } from '../../config/constants.js'
import { pausesIn } from './pauses.js'

const WINDOW_MS = 20
// Quieter than this, nobody is speaking
const SPEAKING_DB = -45
// How far from a language's usual pace a take may be and still be all of its words. Stored clips
// (Oct 2026) run from 0.4 to 1.2 times the usual pace, by voice and direction; these leave room either side.
const FASTEST = 2.5
const SLOWEST = 0.2
// On top of the words: a slow start, and each sound the voice is asked to make
const SPARE_MS = 2500
const SOUND_MS = 2000
// A digit is said as a word
const LETTERS_PER_DIGIT = 6

/** How long the voice is actually going in 16-bit mono PCM, silences left out */
function speakingMs(pcm: Buffer, sampleRate: number) {
  const window = Math.max(1, Math.round((sampleRate * WINDOW_MS) / 1000))
  const count = Math.floor(pcm.length / 2)
  let speaking = 0
  for (let from = 0; from + window <= count; from += window) {
    let sum = 0
    for (let i = from; i < from + window; i++) {
      const v = pcm.readInt16LE(i * 2) / 32768
      sum += v * v
    }
    if (10 * Math.log10(sum / window + 1e-12) > SPEAKING_DB) speaking++
  }
  return speaking * WINDOW_MS
}

/**
 * What's wrong with a take's length, if anything: 'short' when the voice
 * can't have said all the words in that time (it stopped early, or returned
 * next to nothing), 'long' when it said far more than the words (it carried
 * on, or read something else). Null when the length fits the text.
 */
export function lengthFault(pcm: Buffer, sampleRate: number, text: string, language: keyof typeof CHARS_PER_SECOND): 'short' | 'long' | null {
  const words = text.replace(/<[^>]+>/g, ' ')
  const sounds = text.match(/<[^>]+>/g)?.length ?? 0
  const letters = words.match(/\p{L}/gu)?.length ?? 0
  const digits = words.match(/\p{N}/gu)?.length ?? 0
  if (!letters && !digits) return null
  const pace = CHARS_PER_SECOND[language]
  const spoken = speakingMs(pcm, sampleRate)
  if (spoken < ((letters + digits) / (pace * FASTEST)) * 1000) return 'short'
  if (spoken > ((letters + digits * LETTERS_PER_DIGIT) / (pace * SLOWEST)) * 1000 + SPARE_MS + sounds * SOUND_MS) return 'long'
  return null
}

/**
 * How fast a recording of `text` is spoken, against the usual pace of its
 * language: 1 is usual, 1.5 half as fast again. Counted in letters per second
 * while the voice is going (pauses left out), which comes to about the
 * language's CHARS_PER_SECOND at a reading pace in every script measured
 * (stored clips, Oct 2026: 0.75 to 1.2 of it). Null when there's too little
 * to tell.
 */
export function paceOf(pcm: Buffer, sampleRate: number, text: string, language: keyof typeof CHARS_PER_SECOND) {
  const count = Math.floor(pcm.length / 2)
  const samples = new Float32Array(count)
  for (let i = 0; i < count; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768
  const silentMs = pausesIn({ samples, sampleRate }).reduce((ms, p) => ms + (p[1] - p[0]), 0)
  const speakingSec = (count / sampleRate) - silentMs / 1000
  const sounds = text.match(/[\p{L}\p{M}\p{N}]/gu)?.length ?? 0
  if (sounds < 8 || speakingSec < 0.5) return null
  return sounds / speakingSec / CHARS_PER_SECOND[language]
}
