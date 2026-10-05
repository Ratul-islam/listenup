import { requireOptionalNativeModule } from 'expo';

export interface PhoneVoice {
  /** Engine voice name */
  id: string;
  /** BCP-47, e.g. "bn-BD" */
  language: string;
  /** 100 (very low) to 500 (very high) */
  quality: number;
  needsNetwork: boolean;
}

export interface PhoneClip {
  /** file:// URI of a WAV file */
  uri: string;
  durationMs: number;
}

interface PhoneVoiceNative {
  getVoicesAsync(): Promise<{ engine: string | null; voices: PhoneVoice[] }>;
  synthesizeAsync(text: string, language: string, voiceId: string | null): Promise<PhoneClip>;
  concatAsync(uris: string[]): Promise<PhoneClip>;
  openInstallVoiceData(): boolean;
  recognizeAsync(language: string | null, prompt: string | null): Promise<string | null>;
}

// Android only; missing on other platforms and in Expo Go
const native = requireOptionalNativeModule<PhoneVoiceNative>('PhoneVoice');

/** Error codes the native side rejects with */
export type PhoneVoiceErrorCode = 'ENGINE_UNAVAILABLE' | 'VOICE_MISSING' | 'SYNTHESIS_FAILED' | 'CONCAT_FAILED' | 'ENGINE_STOPPED';

const unavailable = () => Object.assign(new Error("Phone voices aren't available on this device."), { code: 'ENGINE_UNAVAILABLE' });

/** The phone's built-in text-to-speech: free, offline, no emotions */
export const phoneVoice = {
  isAvailable: native != null,

  /** Installed voices, so the app can tell whether a language (e.g. Bangla) needs downloading */
  async getVoices() {
    return native ? native.getVoicesAsync() : { engine: null, voices: [] as PhoneVoice[] };
  },

  /** Whether an installed voice speaks this language ("bn", "en", …) */
  async hasLanguage(language: string) {
    const { voices } = await this.getVoices();
    return voices.some((v) => v.language.split('-')[0] === language);
  },

  /** Reads text into a cached WAV file with the best installed voice for the language */
  synthesize(text: string, language: string, voiceId: string | null = null): Promise<PhoneClip> {
    return native ? native.synthesizeAsync(text, language, voiceId) : Promise.reject(unavailable());
  },

  /** Joins clips (same voice) into one file */
  concat(uris: string[]): Promise<PhoneClip> {
    return native ? native.concatAsync(uris) : Promise.reject(unavailable());
  },

  /** Listens for spoken words (e.g. voice search); null if the listener cancelled */
  recognize(options: { language?: string; prompt?: string } = {}): Promise<string | null> {
    return native ? native.recognizeAsync(options.language ?? null, options.prompt ?? null) : Promise.reject(unavailable());
  },

  /** Opens Android's screen for downloading voices; false if there's none */
  openInstallVoiceData() {
    return native ? native.openInstallVoiceData() : false;
  },
};
