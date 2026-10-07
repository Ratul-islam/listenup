import { requireOptionalNativeModule, type NativeModule } from 'expo';

import { writeOutChineseNumbers } from './chinese-numbers';

export interface KokoroStatus {
  installed: boolean;
  /** Version of the installed package */
  version: number | null;
  /** Kokoro voices in it ("af_heart", …) */
  speakers: string[];
  downloading: boolean;
  /** Threads it speaks with */
  threads: number;
  /** CPU cores on this phone */
  cores: number;
}

export interface KokoroClip {
  /** file:// URI of a WAV file */
  uri: string;
  durationMs: number;
  /** How long it took to voice (0 when it came from the cache) */
  elapsedMs: number;
}

export interface KokoroProgress {
  phase: 'downloading' | 'verifying' | 'unpacking';
  done: number;
  total: number;
}

export interface KokoroBenchmark {
  /** Seconds of work per second of speech; below 1 is faster than real time */
  rtf: number;
  elapsedMs: number;
  audioMs: number;
  loadMs: number;
  threads: number;
  provider: KokoroProvider;
}

/** ONNX Runtime backends to try on the test screen */
export type KokoroProvider = 'cpu' | 'xnnpack' | 'nnapi';

export interface KokoroPackage {
  url: string;
  version: number;
  sha256: string;
  bytes: number;
  unpackedBytes: number;
}

declare class KokoroVoiceNative extends NativeModule<{ onProgress: (progress: KokoroProgress) => void }> {
  getStatus(): KokoroStatus;
  setOptions(threads: number | null, provider: KokoroProvider | null): void;
  downloadAsync(url: string, version: number, sha256: string, bytes: number, unpackedBytes: number): Promise<KokoroStatus>;
  cancelDownload(): void;
  removeAsync(): Promise<KokoroStatus>;
  warmUpAsync(): Promise<number | null>;
  synthesizeAsync(text: string, speaker: string, speed: number): Promise<KokoroClip>;
  benchmarkAsync(threads: number | null, provider: KokoroProvider | null): Promise<KokoroBenchmark>;
  releaseAsync(): Promise<void>;
}

// Android only; missing on other platforms and in Expo Go
const native = requireOptionalNativeModule<KokoroVoiceNative>('KokoroVoice');

/** Error codes the native side rejects with */
export type KokoroErrorCode =
  | 'NOT_INSTALLED'
  | 'VOICE_MISSING'
  | 'LOAD_FAILED'
  | 'SYNTHESIS_FAILED'
  | 'NOTHING_TO_SAY'
  | 'NO_SPACE'
  | 'CHECKSUM'
  | 'NETWORK'
  | 'DOWNLOAD_FAILED'
  | 'INSTALL_FAILED'
  | 'CANCELLED'
  | 'BUSY';

const unavailable = () => Object.assign(new Error("Natural voices can't run on this device."), { code: 'NOT_INSTALLED' });

const EMPTY: KokoroStatus = { installed: false, version: null, speakers: [], downloading: false, threads: 1, cores: 1 };

/** Kokoro-82M running on the phone: Natural voices for free, offline, once downloaded */
export const kokoroVoice = {
  isAvailable: native != null,

  getStatus: (): KokoroStatus => native?.getStatus() ?? EMPTY,

  /** Threads (null: automatic) and backend used from the next clip on */
  setOptions(threads: number | null, provider: KokoroProvider | null = null) {
    native?.setOptions(threads, provider);
  },

  /** Downloads and installs a package, resuming an interrupted download */
  async download(pkg: KokoroPackage, onProgress?: (progress: KokoroProgress) => void) {
    if (!native) throw unavailable();
    const sub = onProgress ? native.addListener('onProgress', onProgress) : null;
    try {
      return await native.downloadAsync(pkg.url, pkg.version, pkg.sha256, pkg.bytes, pkg.unpackedBytes);
    } finally {
      sub?.remove();
    }
  },

  /** Stops the download; it resumes from there next time */
  cancelDownload() {
    native?.cancelDownload();
  },

  remove: () => (native ? native.removeAsync() : Promise.resolve(EMPTY)),

  /** Loads the model now, so the first clip doesn't wait for it */
  warmUp: () => (native ? native.warmUpAsync() : Promise.resolve(null)),

  /** Reads text into a cached WAV file with a Kokoro voice ("af_heart") */
  synthesize(text: string, speaker: string, speed = 1): Promise<KokoroClip> {
    if (!native) return Promise.reject(unavailable());
    const spoken = speaker.startsWith('z') ? writeOutChineseNumbers(text) : text;
    return native.synthesizeAsync(spoken, speaker, speed);
  },

  /** Times a test sentence, to tell whether this phone is fast enough */
  benchmark(threads: number | null = null, provider: KokoroProvider | null = null) {
    return native ? native.benchmarkAsync(threads, provider) : Promise.reject(unavailable());
  },

  /** Frees the model's memory now */
  release: () => (native ? native.releaseAsync() : Promise.resolve()),
};
