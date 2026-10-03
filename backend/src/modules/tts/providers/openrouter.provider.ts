import { pcmRate, pcmToMp3 } from '../../../lib/audio/encode.js'
import { normalizeMp3 } from '../../../lib/audio/mp3.js'
import { createSpeech } from '../../../lib/openrouter.js'
import type { SynthesisRequest, SynthesisResult, TtsProvider } from './tts-provider.js'

// Models that only return raw PCM (verified: Gemini TTS rejects mp3)
const PCM_ONLY = /gemini.*tts/i

export class OpenRouterTtsProvider implements TtsProvider {
  readonly name = 'openrouter'
  readonly billable = true

  async synthesize({ text, voice, style }: SynthesisRequest): Promise<SynthesisResult> {
    const pcm = PCM_ONLY.test(voice.model)
    const { audio, contentType } = await createSpeech({
      model: voice.model,
      input: text,
      voice: voice.providerVoice,
      style,
      responseFormat: pcm ? 'pcm' : 'mp3',
    })

    // Store everything as MP3 so clips stay small and play everywhere
    const encoded = pcm || /pcm/i.test(contentType ?? '') ? pcmToMp3(audio, pcmRate(contentType)) : audio
    const { audio: mp3, durationMs } = normalizeMp3(encoded)
    return { audio: mp3, durationMs: durationMs || undefined, mimeType: 'audio/mpeg', extension: 'mp3', provider: this.name, model: voice.model }
  }
}
