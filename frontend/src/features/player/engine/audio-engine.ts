import {
  createAudioPlayer,
  preload,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { AppState } from 'react-native';

import type { ChunkExpressions } from '@/features/expression/catalog';
import { documentsApi } from '@/features/library/api/documents.api';
import type { Lang, ReaderChunk, ReaderData } from '@/features/library/types';
import { offlineFiles } from '@/features/offline/offline-files';
import { DeviceChunk } from '@/features/on-device/device-chunk';
import { isOnDeviceActive, onDeviceVoice, useOnDeviceStore } from '@/features/on-device/on-device-voice';
import { voicesApi, type VoiceTier } from '@/features/voices/api/voices.api';
import { voicesKey } from '@/features/voices/hooks/use-voices';
import { ApiError, getErrorMessage, hasErrorCode } from '@/lib/api/api-error';
import { queryClient } from '@/lib/query-client';
import { noteFinishedDocument } from '@/lib/review-prompt';
import { setActivePronunciations, speakable } from '@/features/pronunciations/lib/pronounce';
import { phoneVoice } from '@/modules/phone-voice';

import { playbackApi, type ChunkAudio } from '../api/playback.api';
import { chunkDuration, globalPosition, initialPlayerState, locate, usePlayerStore, type AudioSource } from '../store/player.store';

const REPORT_EVERY_MS = 15_000;
const SKIP_MS = 15_000;

const get = usePlayerStore.getState;
const set = usePlayerStore.setState;

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code ?? null;

/** A chunk's audio and where it came from; Natural voices made on the phone also carry their parts */
type PlayableAudio = ChunkAudio & { source: AudioSource; device?: DeviceChunk };

const fromServer = (audio: Promise<ChunkAudio>): Promise<PlayableAudio> => audio.then((a) => ({ ...a, source: 'server' }));

/**
 * Streams a document chunk by chunk through a single expo-audio player.
 * The next chunk is requested (so the server generates it) and preloaded
 * while the current one plays, so handoffs are near-seamless. Phone voices,
 * and Natural voices once they're downloaded to the phone, are voiced on the
 * device into files and play through the same player. Natural voices on the
 * phone are voiced a few sentences at a time, so a chunk starts playing once
 * its first part is ready.
 * When the server refuses new audio (minutes used up, daily cap), playback
 * switches that language to the phone voice instead of stopping.
 */
class AudioEngine {
  private player: AudioPlayer | null = null;
  private urls = new Map<string, Promise<PlayableAudio>>();
  /** The chunk playing, when it's voiced on the phone part by part */
  private device: { index: number; chunk: DeviceChunk; part: number; startMs: number } | null = null;
  private loadToken = 0;
  private listenedMs = 0;
  private lastTick: number | null = null;
  private reportTimer: ReturnType<typeof setInterval> | null = null;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private configured = false;

  private async ensurePlayer() {
    if (!this.configured) {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
      AppState.addEventListener('change', (s) => s !== 'active' && void this.report());
      // Android 13+ needs this for the media notification / lock-screen controls
      void requestNotificationPermissionsAsync().catch(() => {});
      this.configured = true;
    }
    if (!this.player) {
      this.player = createAudioPlayer(null, { updateInterval: 250, keepAudioSessionActive: true });
      this.player.addListener('playbackStatusUpdate', this.onStatus);
    }
    return this.player;
  }

  private onStatus = (status: AudioStatus) => {
    const now = Date.now();
    if (status.playing && this.lastTick) this.listenedMs += now - this.lastTick;
    this.lastTick = status.playing ? now : null;

    set({
      positionMs: Math.round((this.device?.startMs ?? 0) + status.currentTime * 1000),
      isPlaying: status.playing,
      isBuffering: status.isBuffering,
    });
    if (!status.didJustFinish) return;
    if (this.device && this.device.part + 1 < this.device.chunk.parts.length) return void this.nextPart();
    // The creator's pause after this part, unless the listener moves on meanwhile
    const pause = get().chunks[get().chunkIndex]?.pauseAfterMs ?? 0;
    if (!pause) return void this.next();
    const token = this.loadToken;
    setTimeout(() => token === this.loadToken && void this.next(), pause);
  };

  /**
   * Who reads a part, and at what level: its own voice (a character) if it has
   * one, otherwise its language's. Once a language falls back to the phone
   * voice, every part in it does.
   */
  private partVoice(index: number): { voice: string; tier: VoiceTier } {
    const { chunks, voices, tiers } = get();
    const chunk = chunks[index];
    const lang = (chunk?.language ?? 'en') as Lang;
    if (chunk?.ownVoiceId && chunk.tier && tiers[lang] !== 'phone') return { voice: chunk.ownVoiceId, tier: chunk.tier };
    return { voice: voices[lang], tier: tiers[lang] };
  }

  private voiceFor(index: number) {
    return this.partVoice(index).voice;
  }

  /** Audio URL for a chunk; requesting it makes the server (or, for phone voices and downloaded Natural voices, the device) voice it */
  private audioFor(index: number): Promise<PlayableAudio> {
    const { documentId, voiceId, chunks, speed } = get();
    const chunk = chunks[index];
    const { voice, tier } = this.partVoice(index);
    const key = `${documentId}:${index}:${voice}`;
    let pending = this.urls.get(key);
    if (!pending) {
      const saved = chunk && tier !== 'phone' ? offlineFiles.clipFor(documentId!, chunk, voice) : null;
      const speaker = chunk && tier === 'natural' ? onDeviceVoice.speakerFor(voice, speed) : null;
      pending = saved
        ? Promise.resolve<PlayableAudio>({
            index,
            voiceId: voice,
            language: chunk!.language,
            durationMs: saved.durationMs,
            mimeType: 'audio/mpeg',
            url: saved.uri,
            source: 'download',
          })
        : chunk && tier === 'phone'
          ? this.phoneAudio(chunk)
          : chunk && speaker
            ? this.deviceAudio(chunk, voice, speaker)
            : fromServer(playbackApi.audio(documentId!, index, voiceId ?? undefined));
      pending.catch(() => this.urls.delete(key));
      this.urls.set(key, pending);
    }
    return pending;
  }

  private async phoneAudio(chunk: ReaderChunk): Promise<PlayableAudio> {
    const clip = await phoneVoice.synthesize(speakable(chunk.text), chunk.language);
    return {
      index: chunk.index,
      voiceId: `phone-${chunk.language}`,
      language: chunk.language,
      durationMs: clip.durationMs,
      mimeType: 'audio/wav',
      url: clip.uri,
      source: 'phone',
    };
  }

  /**
   * A Natural voice made on this phone, free, ready once its first part is.
   * If the phone can't, the server voices it, and the rest of the session.
   */
  private async deviceAudio(chunk: ReaderChunk, voiceId: string, speaker: string): Promise<PlayableAudio> {
    const documentId = get().documentId;
    const device = new DeviceChunk(chunk, speaker, (durationMs) => {
      // The timeline firms up as parts are voiced
      if (get().documentId !== documentId || this.voiceFor(chunk.index) !== voiceId) return;
      set((s) => ({ chunks: s.chunks.map((c) => (c.index === chunk.index ? { ...c, durationMs } : c)) }));
    });
    device.requestAll();
    try {
      const first = await device.clip(0);
      const audio = { index: chunk.index, voiceId, language: chunk.language, mimeType: 'audio/wav' };
      return { ...audio, durationMs: device.estimatedMs(), url: first.uri ?? '', source: 'device', device };
    } catch (error) {
      if (codeOf(error) === 'CANCELLED') throw error;
      onDeviceVoice.noteFailure();
      return fromServer(playbackApi.audio(documentId!, chunk.index, get().voiceId ?? undefined));
    }
  }

  /**
   * Plays part `part` of the phone-voiced chunk, from `offsetMs` into it,
   * waiting for it to be voiced if needed. Parts with nothing to say are skipped.
   */
  private async playDevicePart(token: number, part: number, startMs: number, offsetMs: number, autoplay: boolean) {
    const current = this.device!;
    const wanted = () => token === this.loadToken;
    const player = await this.ensurePlayer();
    try {
      for (let i = part, start = startMs, offset = offsetMs; i < current.chunk.parts.length; i++, offset = 0) {
        const clip = await current.chunk.clip(i, wanted);
        if (!wanted()) return;
        if (!clip.uri) {
          start += clip.durationMs;
          continue;
        }
        this.device = { ...current, part: i, startMs: start };
        player.replace({ uri: clip.uri });
        player.setPlaybackRate(get().speed, 'high');
        if (offset > 0) {
          await this.waitUntilLoaded(player);
          if (!wanted()) return;
          await player.seekTo(offset / 1000);
        }
        if (autoplay) player.play();
        // Have the next part ready to swap in
        if (i + 1 < current.chunk.parts.length) {
          current.chunk
            .clip(i + 1)
            .then((next) => {
              if (next.uri) void preload({ uri: next.uri });
            })
            .catch(() => {});
        }
        return;
      }
      // Nothing left to say in this chunk
      if (wanted()) void this.next();
    } catch {
      if (!wanted()) return;
      // The phone stopped voicing: the server takes this chunk from here
      onDeviceVoice.noteFailure();
      this.forget(current.index);
      this.device = null;
      void this.loadChunk(current.index, get().positionMs, autoplay);
    }
  }

  /** The current part ended: on to the next one in the same chunk */
  private async nextPart() {
    const current = this.device!;
    const token = ++this.loadToken;
    set({ isBuffering: true });
    const { durationMs } = await current.chunk.clip(current.part).catch(() => ({ durationMs: 0 }));
    if (token !== this.loadToken) return;
    await this.playDevicePart(token, current.part + 1, current.startMs + durationMs, 0, true);
  }

  /**
   * The server won't voice more right now: use the phone voice for that
   * language for the rest of this session. False if that's not possible.
   */
  private fallBackToPhone(index: number, error: unknown) {
    // Out of minutes, the daily cap, or the voice service down or stuck
    if (!phoneVoice.isAvailable || !hasErrorCode(error, 'USAGE_LIMIT_REACHED', 'BUDGET_PAUSED', 'PROVIDER_TIMEOUT', 'PROVIDER_ERROR')) return false;
    const lang = get().chunks[index]?.language ?? 'en';
    const tier = get().tiers[lang];
    if (tier === 'phone') return false;

    const outOfMinutes = hasErrorCode(error, 'USAGE_LIMIT_REACHED');
    // Natural voices could be free on this phone instead
    const offerOnDevice = outOfMinutes && tier === 'natural' && onDeviceVoice.isSupported && !isOnDeviceActive(useOnDeviceStore.getState());
    set((s) => ({
      voices: { ...s.voices, [lang]: `phone-${lang}` },
      tiers: { ...s.tiers, [lang]: 'phone' },
      expressive: { ...s.expressive, [lang]: false },
      notice: {
        message: outOfMinutes
          ? `You're out of ${tier === 'expressive' ? 'Expressive' : 'Natural'} minutes, so ListenUp switched to your phone's voice.`
          : "ListenUp's voices are busy right now, so it switched to your phone's voice.",
        showPlans: outOfMinutes,
        offerAd: outOfMinutes && tier === 'natural',
        offerOnDevice,
      },
    }));
    return true;
  }

  private warmNext(index: number) {
    if (index >= get().chunks.length) return;
    this.audioFor(index)
      .then((audio) => {
        // Parts dropped by a seek are queued again
        audio.device?.requestAll();
        if (audio.url) preload({ uri: audio.url });
      })
      .catch(() => {});
  }

  private async loadChunk(index: number, offsetMs: number, autoplay: boolean) {
    const token = ++this.loadToken;
    const player = await this.ensurePlayer();
    set({ chunkIndex: index, positionMs: offsetMs, isBuffering: true, finished: false, error: null, errorCode: null });

    try {
      const audio = await this.audioFor(index);
      if (token !== this.loadToken) return;

      // Real duration replaces the estimate so the timeline tightens up
      const durationMs = audio.device ? audio.device.estimatedMs() : audio.durationMs;
      set((s) => ({ source: audio.source, chunks: s.chunks.map((c) => (c.index === index ? { ...c, durationMs } : c)) }));

      this.device = null;
      if (audio.device) {
        audio.device.requestAll();
        const wanted = () => token === this.loadToken;
        let found: { part: number; startMs: number };
        try {
          found = await audio.device.locate(offsetMs, wanted);
        } catch {
          if (!wanted()) return;
          // The phone stopped voicing: the server takes over
          onDeviceVoice.noteFailure();
          this.forget(index);
          return void this.loadChunk(index, offsetMs, autoplay);
        }
        if (!wanted()) return;
        const { part, startMs } = found;
        this.device = { index, chunk: audio.device, part, startMs };
        await this.playDevicePart(token, part, startMs, Math.max(offsetMs - startMs, 0), autoplay);
        if (!wanted()) return;
        this.updateLockScreen();
        this.warmNext(index + 1);
        return;
      }

      player.replace({ uri: audio.url });
      player.setPlaybackRate(get().speed, 'high');
      if (offsetMs > 0) {
        // Seeking before the new source has loaded is ignored, so wait for it
        await this.waitUntilLoaded(player);
        if (token !== this.loadToken) return;
        await player.seekTo(offsetMs / 1000);
      }
      if (autoplay) player.play();
      this.updateLockScreen();
      this.warmNext(index + 1);
    } catch (error) {
      if (token !== this.loadToken) return;
      if (this.fallBackToPhone(index, error)) return void this.loadChunk(index, offsetMs, autoplay);
      player.pause();
      set({ isBuffering: false, isPlaying: false, error: getErrorMessage(error), errorCode: codeOf(error) });
    }
  }

  private async waitUntilLoaded(player: AudioPlayer, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (!player.isLoaded && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  }

  private async next() {
    const { chunkIndex, chunks } = get();
    if (chunkIndex + 1 < chunks.length) {
      await this.loadChunk(chunkIndex + 1, 0, true);
      void this.report();
    } else {
      set({ isPlaying: false, finished: true, positionMs: chunkDuration(chunks[chunkIndex]) });
      await this.report(true);
      void noteFinishedDocument();
      await this.playNextItem();
    }
  }

  /** "Play next automatically": the next unfinished item in the same folder, or loose on the shelf */
  private async playNextItem() {
    const { document } = get();
    if (!document) return;
    const voices = await queryClient
      .fetchQuery({ queryKey: voicesKey, queryFn: voicesApi.list, staleTime: 5 * 60_000 })
      .catch(() => null);
    if (!voices?.preferences.autoPlayNext) return;

    const { items } = await documentsApi
      .list({ category: 'all', sort: 'recent', folder: document.folderId ?? 'root' })
      .catch(() => ({ items: [] as ReaderData['document'][] }));
    // Shelf order, starting after this item and wrapping round
    const at = items.findIndex((d) => d.id === document.id);
    const next = [...items.slice(at + 1), ...items.slice(0, Math.max(at, 0))].find(
      (d) => d.status === 'READY' && !d.progress?.completedAt,
    );
    // Only if the listener hasn't started something else meanwhile
    if (next && get().documentId === document.id && get().finished) await this.open(next.id);
  }

  private updateLockScreen() {
    const { document } = get();
    if (!this.player || !document) return;
    this.player.setActiveForLockScreen(
      true,
      { title: document.title, artist: document.author ?? 'ListenUp', albumTitle: 'ListenUp' },
      { showSeekBackward: true, showSeekForward: true },
    );
  }

  /** Saves position and listening time (for resume, streaks and stats) */
  async report(completed?: boolean) {
    const { documentId, chunkIndex, positionMs, voiceId, speed, status } = get();
    if (!documentId || status !== 'ready') return;
    const listenedSec = Math.round(this.listenedMs / 1000);
    this.listenedMs = 0;
    try {
      await playbackApi.saveProgress(documentId, {
        chunkIndex,
        offsetMs: positionMs,
        voiceId: voiceId ?? undefined,
        speed,
        listenedSec,
        ...(completed !== undefined && { completed }),
      });
      if (listenedSec > 0 || completed) {
        void queryClient.invalidateQueries({ queryKey: ['stats'] });
        void queryClient.invalidateQueries({ queryKey: ['documents'] });
      }
    } catch {
      this.listenedMs += listenedSec * 1000; // retry with the next report
    }
  }

  private startReporting() {
    if (this.reportTimer) return;
    this.reportTimer = setInterval(() => get().isPlaying && void this.report(), REPORT_EVERY_MS);
  }

  /** Opens a document (resuming where the listener left off) and optionally starts playing */
  async open(documentId: string, { autoplay = true, voiceId }: { autoplay?: boolean; voiceId?: string } = {}) {
    const state = get();
    if (state.documentId === documentId && state.status === 'ready' && !voiceId) {
      if (autoplay) this.play();
      return;
    }
    if (state.documentId) await this.report();

    this.urls.clear();
    this.device = null;
    onDeviceVoice.dropQueued();
    set({ ...initialPlayerState, status: 'loading', documentId, speed: state.speed });
    // Natural voices on the phone: load the model while the document loads
    if (isOnDeviceActive(useOnDeviceStore.getState())) onDeviceVoice.warmUp();
    try {
      const reader = await this.loadReader(documentId, voiceId);
      setActivePronunciations(reader.pronunciations);
      const progress = reader.document.progress;
      const restart = !!progress?.completedAt;
      set({
        status: 'ready',
        document: reader.document,
        chunks: reader.chunks,
        voices: reader.voices,
        expressive: reader.expressive,
        tiers: reader.tiers,
        voiceId: voiceId ?? progress?.voiceId ?? null,
        speed: reader.speed,
      });
      this.startReporting();
      await this.loadChunk(restart ? 0 : (progress?.chunkIndex ?? 0), restart ? 0 : (progress?.offsetMs ?? 0), autoplay);
    } catch (error) {
      set({ status: 'error', error: getErrorMessage(error) });
    }
  }

  /** The document's text and voices, from the server, or from its download when offline */
  private async loadReader(documentId: string, voiceId?: string): Promise<ReaderData> {
    try {
      return await documentsApi.script(documentId, voiceId);
    } catch (error) {
      const saved = offlineFiles.get(documentId);
      if (saved && error instanceof ApiError && error.isNetworkError) return saved.reader;
      throw error;
    }
  }

  play() {
    const { finished, error, chunkIndex, positionMs } = get();
    if (finished) return void this.loadChunk(0, 0, true);
    if (error) return void this.loadChunk(chunkIndex, positionMs, true);
    this.player?.play();
  }

  pause() {
    this.player?.pause();
    void this.report();
  }

  toggle() {
    if (get().isPlaying) this.pause();
    else this.play();
  }

  /** Jump to a position on the whole-document timeline */
  async seek(globalMs: number) {
    const { chunks, chunkIndex, isPlaying } = get();
    const target = locate(chunks, globalMs);
    const device = this.device;
    if (device && target.index === chunkIndex && this.player) {
      // Inside the part playing: just move; otherwise find (and maybe voice) the part
      const partMs = (this.player.duration || 0) * 1000;
      if (target.offsetMs >= device.startMs && target.offsetMs < device.startMs + partMs) {
        set({ positionMs: target.offsetMs, finished: false });
        await this.player.seekTo((target.offsetMs - device.startMs) / 1000);
        return;
      }
    }
    // Sentences queued for parts nobody will hear now
    if (target.index !== chunkIndex) onDeviceVoice.dropQueued();
    if (!device && target.index === chunkIndex && this.player) {
      set({ positionMs: target.offsetMs, finished: false });
      await this.player.seekTo(target.offsetMs / 1000);
    } else {
      await this.loadChunk(target.index, target.offsetMs, isPlaying || get().finished);
    }
  }

  skip(direction: 1 | -1) {
    const { positionMs } = globalPosition(get());
    void this.seek(positionMs + direction * SKIP_MS);
  }

  /** Starts a given chunk from its beginning (transcript taps) */
  playChunk(index: number) {
    if (index !== get().chunkIndex) onDeviceVoice.dropQueued();
    void this.loadChunk(index, 0, true);
  }

  setSpeed(speed: number) {
    set({ speed });
    this.player?.setPlaybackRate(speed, 'high');
    void this.report();
  }

  /** Re-voices the rest of the document, restarting the current chunk */
  async setVoice(voiceId: string) {
    const { documentId, chunkIndex, isPlaying } = get();
    if (!documentId) return;
    this.urls.clear();
    this.device = null;
    onDeviceVoice.dropQueued();
    try {
      const reader = await documentsApi.script(documentId, voiceId);
      setActivePronunciations(reader.pronunciations);
      set({ voiceId, voices: reader.voices, expressive: reader.expressive, tiers: reader.tiers, chunks: reader.chunks });
      await this.loadChunk(chunkIndex, 0, isPlaying);
      void this.report();
    } catch (error) {
      if (this.switchVoiceOffline(voiceId, error)) return void this.loadChunk(chunkIndex, 0, isPlaying);
      set({ error: getErrorMessage(error) });
    }
  }

  /**
   * No connection: switch voices without the server when this device can still
   * play the new one, i.e. it's the phone voice, a Natural voice made on this
   * phone, or the voice the download used.
   */
  private switchVoiceOffline(voiceId: string, error: unknown) {
    if (!(error instanceof ApiError && error.isNetworkError)) return false;
    const { documentId } = get();
    const voices = queryClient.getQueryData<{ voices: { id: string; language: Lang; tier: ReaderData['tiers'][Lang]; expressive: boolean }[] }>(voicesKey)?.voices;
    const voice = voices?.find((v) => v.id === voiceId);
    const downloaded = documentId ? offlineFiles.get(documentId) : null;
    const playable = voice && (voice.tier === 'phone' || onDeviceVoice.speakerFor(voice.id) || downloaded?.voices[voice.language] === voiceId);
    if (!voice || !playable) return false;
    set((s) => ({
      voiceId,
      voices: { ...s.voices, [voice.language]: voice.id },
      tiers: { ...s.tiers, [voice.language]: voice.tier },
      expressive: { ...s.expressive, [voice.language]: voice.expressive },
    }));
    return true;
  }

  /** Drops cached audio links so these chunks are fetched (and re-voiced) again */
  private forget(from: number, to = from) {
    for (const key of [...this.urls.keys()]) {
      const index = Number(key.split(':')[1]);
      if (index >= from && index <= to) this.urls.delete(key);
    }
  }

  /** New emotions for a chunk; it's re-voiced the next time it loads */
  setExpressions(index: number, expressions: ChunkExpressions) {
    this.forget(index);
    set((s) => ({ chunks: s.chunks.map((c) => (c.index === index ? { ...c, expressions, durationMs: null } : c)) }));
  }

  /** Re-voices a chunk and plays it from a character, so an edit can be heard right away */
  async replayFrom(index: number, char: number) {
    const chunk = get().chunks[index];
    if (!chunk) return;
    const token = ++this.loadToken;
    this.player?.pause();
    const at = (duration: number) => Math.round((char / Math.max(chunk.text.length, 1)) * duration);
    set({ chunkIndex: index, positionMs: at(chunkDuration(chunk)), isBuffering: true, finished: false, error: null });
    try {
      const audio = await this.audioFor(index);
      if (token !== this.loadToken) return;
      await this.loadChunk(index, at(audio.durationMs), true);
    } catch (error) {
      if (token !== this.loadToken) return;
      if (this.fallBackToPhone(index, error)) return void this.loadChunk(index, 0, true);
      set({ isBuffering: false, isPlaying: false, error: getErrorMessage(error), errorCode: codeOf(error) });
    }
  }

  /**
   * Takes in emotions changed in the background ("Make it expressive", "Remove
   * all"). The chunk playing now keeps its audio; later ones are re-voiced.
   */
  applyReader(reader: ReaderData) {
    const { chunkIndex } = get();
    setActivePronunciations(reader.pronunciations);
    this.forget(chunkIndex + 1, Number.MAX_SAFE_INTEGER);
    set((s) => ({
      document: reader.document,
      chunks: s.chunks.map((c, i) => {
        const fresh = reader.chunks[i];
        if (!fresh) return c;
        return i === chunkIndex ? { ...c, expressions: fresh.expressions } : fresh;
      }),
    }));
  }

  /**
   * Takes in a script edited elsewhere (parts changed, added or removed,
   * pronunciations, new takes) for the open document. Playback carries on; the
   * part playing keeps its audio unless it changed, and the rest is fetched again.
   */
  async refresh(documentId?: string) {
    const { documentId: open, voiceId, chunkIndex } = get();
    if (!open || (documentId && documentId !== open)) return;
    try {
      const reader = await documentsApi.script(open, voiceId ?? undefined);
      if (get().documentId !== open) return;
      setActivePronunciations(reader.pronunciations);
      const playing = get().chunks[chunkIndex];
      const fresh = reader.chunks[chunkIndex];
      const sound = (c: ReaderChunk) => JSON.stringify([c.text, c.take, c.sentenceTakes, c.ownVoiceId, c.voiceId]);
      const unchanged = playing && fresh && sound(playing) === sound(fresh);
      for (const key of [...this.urls.keys()]) if (!unchanged || Number(key.split(':')[1]) !== chunkIndex) this.urls.delete(key);
      set({ document: reader.document, chunks: reader.chunks, chunkIndex: Math.min(chunkIndex, Math.max(reader.chunks.length - 1, 0)) });
    } catch {
      // Picked up the next time the document opens
    }
  }

  setSleepTimer(minutes: number | null) {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    if (!minutes) return set({ sleepAt: null });
    set({ sleepAt: Date.now() + minutes * 60_000 });
    this.sleepTimer = setTimeout(() => {
      this.pause();
      set({ sleepAt: null });
    }, minutes * 60_000);
  }

  /** Stops playback and forgets the document (e.g. on sign-out or delete) */
  async close() {
    await this.report();
    this.loadToken++;
    this.player?.pause();
    this.player?.setActiveForLockScreen(false);
    this.setSleepTimer(null);
    if (this.reportTimer) clearInterval(this.reportTimer);
    this.reportTimer = null;
    this.urls.clear();
    this.device = null;
    onDeviceVoice.dropQueued();
    set({ ...initialPlayerState, speed: get().speed });
  }
}

export const audioEngine = new AudioEngine();
