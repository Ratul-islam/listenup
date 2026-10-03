import { CHARS_PER_SECOND } from '../../../config/constants.js'
import type { SynthesisRequest, SynthesisResult, TtsProvider } from './tts-provider.js'

const RATE = 22_050

/**
 * Free stand-in for development: soft tone bursts, one per word, timed like
 * real speech. Lets the import → speech → player pipeline run without a key.
 */
export class MockTtsProvider implements TtsProvider {
  readonly name = 'mock'
  readonly billable = false

  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    return { audio: encodeWav(this.render(req)), mimeType: 'audio/wav', extension: 'wav', provider: this.name, model: 'mock-tone' }
  }

  private render({ text, voice, style }: SynthesisRequest) {
    const charSeconds = 1 / CHARS_PER_SECOND[voice.language]
    // Emotional styles sound a little higher so edits are audible in development
    const base = (voice.gender === 'female' ? 230 : 150) * (style && !/^in an? \w+ English accent$/.test(style) ? 1.25 : 1)
    const samples: number[] = []

    const pushTone = (seconds: number, freq: number) => {
      const n = Math.round(seconds * RATE)
      const fade = Math.min(Math.round(0.012 * RATE), n / 2)
      for (let i = 0; i < n; i++) {
        const env = Math.min(1, i / fade, (n - i) / fade)
        samples.push(Math.sin((2 * Math.PI * freq * i) / RATE) * 0.12 * env)
      }
    }
    const pushSilence = (seconds: number) => {
      for (let i = 0, n = Math.round(seconds * RATE); i < n; i++) samples.push(0)
    }

    for (const token of text.split(/(<[^>]+>|\s+)/)) {
      if (!token) continue
      // Sound tags ("<laugh>") become a short low blip
      if (/^<[^>]+>$/.test(token)) {
        pushTone(0.3, base / 2)
        continue
      }
      if (/^\s+$/.test(token)) {
        pushSilence(token.includes('\n') ? 0.45 : charSeconds)
        continue
      }
      pushTone(token.length * charSeconds * 0.85, base + ((token.charCodeAt(0) * 7) % 60))
      if (/[.!?।]$/.test(token)) pushSilence(0.35)
    }
    return samples
  }
}

function encodeWav(samples: number[]) {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples.length * 2, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(RATE, 24)
  buffer.writeUInt32LE(RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((s, i) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2))
  return buffer
}
