import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import { voicesApi, type Voice } from '@/features/voices/api/voices.api';
import { queryClient } from '@/lib/query-client';
import {
  kokoroVoice,
  type KokoroBenchmark,
  type KokoroClip,
  type KokoroProgress,
  type KokoroProvider,
  type KokoroStatus,
} from '@/modules/kokoro-voice';

/**
 * Seconds of work per second of speech (times playback speed) at or below
 * which the phone voices Natural voices itself. Chunks are voiced a sentence
 * at a time, always ahead of what's playing, so the phone only has to keep up
 * on average; the margin covers longer sentences and other apps.
 */
export const FAST_ENOUGH = 0.95;

/** What's kept between launches */
interface Saved {
  /** The speed check for the installed package */
  benchmark: KokoroBenchmark | null;
  /** Package version the speed check ran on */
  checkedVersion: number | null;
  /** Use it even though the check found this phone slow */
  useAnyway: boolean;
  /** The listener's on/off switch */
  enabled: boolean;
  /** Test-screen overrides (null: automatic) */
  threads: number | null;
  provider: KokoroProvider | null;
  /** Kokoro speaker per voice id, from the last voice list, so it works offline too */
  speakers: Record<string, string>;
}

interface OnDeviceState extends Saved {
  status: KokoroStatus;
  progress: KokoroProgress | null;
  checking: boolean;
  error: string | null;
  /** It failed to start this session (e.g. not enough memory): the server voices until the next launch */
  broken: boolean;
}

// Pause between installing and the speed test
const AFTER_INSTALL_PAUSE_MS = 8_000;

const DEFAULTS: Saved = { benchmark: null, checkedVersion: null, useAnyway: false, enabled: true, threads: null, provider: null, speakers: {} };

const savedFile = () => new File(Paths.document, 'on-device-voice.json');

function readSaved(): Saved {
  try {
    const file = savedFile();
    return file.exists ? { ...DEFAULTS, ...(JSON.parse(file.textSync()) as Partial<Saved>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const initial = readSaved();
kokoroVoice.setOptions(initial.threads, initial.provider);

export const useOnDeviceStore = create<OnDeviceState>()(() => ({
  ...initial,
  status: kokoroVoice.getStatus(),
  progress: null,
  checking: false,
  error: null,
  broken: false,
}));

const get = useOnDeviceStore.getState;
const set = useOnDeviceStore.setState;

function save(changes: Partial<Saved>) {
  set(changes);
  const { benchmark, checkedVersion, useAnyway, enabled, threads, provider, speakers } = get();
  try {
    savedFile().write(JSON.stringify({ benchmark, checkedVersion, useAnyway, enabled, threads, provider, speakers }));
  } catch {
    // Not fatal: it's checked again next launch
  }
}

/** Remembers which voices the phone can speak, from the server's voice list */
function rememberSpeakers(data: unknown) {
  const voices = (data as { voices?: Voice[] } | undefined)?.voices;
  if (!voices) return;
  const speakers = Object.fromEntries(voices.filter((v) => v.deviceVoice).map((v) => [v.id, v.deviceVoice!]));
  if (JSON.stringify(speakers) !== JSON.stringify(get().speakers)) save({ speakers });
}

rememberSpeakers(queryClient.getQueryData(['voices']));
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated' && event.query.queryKey[0] === 'voices') rememberSpeakers(event.query.state.data);
});

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code ?? null;

/**
 * Sentences waiting for the model, oldest first. They're sent to the phone's
 * model one at a time so that a seek can drop work nobody will hear.
 */
interface Queued {
  text: string;
  speaker: string;
  resolve: (clip: KokoroClip) => void;
  reject: (error: unknown) => void;
}
const queue: Queued[] = [];
let speaking = false;

function pump() {
  if (speaking) return;
  const item = queue.shift();
  if (!item) return;
  speaking = true;
  kokoroVoice
    .synthesize(item.text, item.speaker)
    .then(item.resolve, item.reject)
    .finally(() => {
      speaking = false;
      pump();
    });
}

const cancelled = () => Object.assign(new Error('Skipped'), { code: 'CANCELLED' });
const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');

/** The speed check is for the installed package, and says this phone keeps up at `speed` */
export const isFastEnough = (s: Pick<OnDeviceState, 'benchmark' | 'checkedVersion' | 'status'>, speed = 1) =>
  !!s.benchmark && s.checkedVersion === s.status.version && s.benchmark.rtf * speed <= FAST_ENOUGH;

/** Natural voices are made on this phone (installed, checked and switched on) */
export const isOnDeviceActive = (s: OnDeviceState) =>
  s.status.installed && s.enabled && !s.broken && (s.useAnyway || isFastEnough(s));

export const onDeviceVoice = {
  isSupported: kokoroVoice.isAvailable,

  /** The Kokoro speaker to voice this voice with on the phone, or null to use the server */
  speakerFor(voiceId: string, speed = 1) {
    const s = get();
    if (!s.status.installed || !s.enabled || s.broken) return null;
    const speaker = s.speakers[voiceId];
    if (!speaker || !s.status.speakers.includes(speaker)) return null;
    return s.useAnyway || isFastEnough(s, speed) ? speaker : null;
  },

  /** Downloads and installs Natural voices, then checks how fast this phone speaks */
  async install() {
    set({ error: null, progress: { phase: 'downloading', done: 0, total: 0 } });
    try {
      const model = await voicesApi.onDeviceModel();
      if (!model.available) throw new Error("Natural voices for your phone aren't ready to download yet. Please try again later.");
      set({ progress: { phase: 'downloading', done: 0, total: model.bytes } });
      const status = await kokoroVoice.download(model, (progress) => set({ progress }));
      set({ status, progress: null, broken: false });
    } catch (error) {
      set({ progress: null, status: kokoroVoice.getStatus(), error: codeOf(error) === 'CANCELLED' ? null : messageOf(error) });
      return;
    }
    await this.checkSpeed({ coolDownMs: AFTER_INSTALL_PAUSE_MS });
  },

  /** Pauses the download; it resumes from there next time */
  pause() {
    kokoroVoice.cancelDownload();
  },

  /** Times a test sentence, which decides whether this phone voices Natural voices itself */
  async checkSpeed({ coolDownMs = 0 }: { coolDownMs?: number } = {}) {
    const { threads, provider } = get();
    set({ checking: true, error: null });
    try {
      // Right after a download and unpack the phone is warm and slows itself down
      if (coolDownMs) await new Promise((r) => setTimeout(r, coolDownMs));
      const benchmark = await kokoroVoice.benchmark(threads, provider);
      save({ benchmark, checkedVersion: get().status.version });
      set({ broken: false });
    } catch (error) {
      set({ error: messageOf(error) });
    } finally {
      set({ checking: false });
    }
  },

  async remove() {
    const status = await kokoroVoice.remove();
    set({ status, progress: null, error: null });
    save({ benchmark: null, checkedVersion: null, useAnyway: false });
  },

  setEnabled: (enabled: boolean) => save({ enabled }),
  setUseAnyway: (useAnyway: boolean) => save({ useAnyway }),

  /** Test screen: threads and backend for speaking from now on */
  setOptions(threads: number | null, provider: KokoroProvider | null) {
    kokoroVoice.setOptions(threads, provider);
    save({ threads, provider });
  },

  /** Reads text with a Kokoro voice into a cached WAV file, after anything already waiting */
  synthesize(text: string, speaker: string) {
    return new Promise<KokoroClip>((resolve, reject) => {
      queue.push({ text, speaker, resolve, reject });
      pump();
    });
  },

  /** Drops sentences still waiting (after a seek, or a new document); the one being voiced finishes */
  dropQueued() {
    for (const item of queue.splice(0)) item.reject(cancelled());
  },

  /** Loads the model while the rest of the document loads */
  warmUp() {
    void kokoroVoice.warmUp().catch(() => {});
  },

  /** Voicing on the phone failed: the server voices the rest of this session */
  noteFailure() {
    set({ broken: true });
  },

  refreshStatus() {
    set({ status: kokoroVoice.getStatus() });
  },
};
