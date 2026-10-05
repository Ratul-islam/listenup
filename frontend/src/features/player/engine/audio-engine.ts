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
import { voicesApi } from '@/features/voices/api/voices.api';
import { voicesKey } from '@/features/voices/hooks/use-voices';
import { ApiError, getErrorMessage, hasErrorCode } from '@/lib/api/api-error';
import { queryClient } from '@/lib/query-client';
import { noteFinishedDocument } from '@/lib/review-prompt';
import { phoneVoice } from '@/modules/phone-voice';

import { playbackApi, type ChunkAudio } from '../api/playback.api';
import { chunkDuration, globalPosition, initialPlayerState, locate, usePlayerStore } from '../store/player.store';

const REPORT_EVERY_MS = 15_000;
const SKIP_MS = 15_000;

const get = usePlayerStore.getState;
const set = usePlayerStore.setState;

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code ?? null;

/**
 * Streams a document chunk by chunk through a single expo-audio player.
 * The next chunk is requested (so the server generates it) and preloaded
 * while the current one plays, so handoffs are near-seamless. Phone voices
 * are voiced on the device into files and play through the same player.
 * When the server refuses new audio (minutes used up, daily cap), playback
 * switches that language to the phone voice instead of stopping.
 */
class AudioEngine {
  private player: AudioPlayer | null = null;
  private urls = new Map<string, Promise<ChunkAudio>>();
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
      positionMs: Math.round(status.currentTime * 1000),
      isPlaying: status.playing,
      isBuffering: status.isBuffering,
    });
    if (status.didJustFinish) void this.next();
  };

  private voiceFor(index: number) {
    const { chunks, voices } = get();
    return voices[(chunks[index]?.language ?? 'en') as Lang];
  }

  /** Audio URL for a chunk; requesting it makes the server (or, for phone voices, the device) voice it */
  private audioFor(index: number) {
    const { documentId, voiceId, chunks, tiers } = get();
    const chunk = chunks[index];
    const key = `${documentId}:${index}:${this.voiceFor(index)}`;
    let pending = this.urls.get(key);
    if (!pending) {
      const saved = chunk && tiers[chunk.language] !== 'phone' ? offlineFiles.clipFor(documentId!, index, this.voiceFor(index), chunk.expressions) : null;
      pending = saved
        ? Promise.resolve({ index, voiceId: this.voiceFor(index), language: chunk!.language, durationMs: saved.durationMs, mimeType: 'audio/mpeg', url: saved.uri })
        : chunk && tiers[chunk.language] === 'phone'
          ? this.phoneAudio(chunk)
          : playbackApi.audio(documentId!, index, voiceId ?? undefined);
      pending.catch(() => this.urls.delete(key));
      this.urls.set(key, pending);
    }
    return pending;
  }

  private async phoneAudio(chunk: ReaderChunk): Promise<ChunkAudio> {
    const clip = await phoneVoice.synthesize(chunk.text, chunk.language);
    return {
      index: chunk.index,
      voiceId: `phone-${chunk.language}`,
      language: chunk.language,
      durationMs: clip.durationMs,
      mimeType: 'audio/wav',
      url: clip.uri,
    };
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
      },
    }));
    return true;
  }

  private warmNext(index: number) {
    if (index >= get().chunks.length) return;
    this.audioFor(index)
      .then((audio) => preload({ uri: audio.url }))
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
      set((s) => ({ chunks: s.chunks.map((c) => (c.index === index ? { ...c, durationMs: audio.durationMs } : c)) }));

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
    set({ ...initialPlayerState, status: 'loading', documentId, speed: state.speed });
    try {
      const reader = await this.loadReader(documentId, voiceId);
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
      return await documentsApi.reader(documentId, voiceId);
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
    if (target.index === chunkIndex && this.player) {
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
    try {
      const reader = await documentsApi.reader(documentId, voiceId);
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
   * play the new one, i.e. it's the phone voice or the voice the download used.
   */
  private switchVoiceOffline(voiceId: string, error: unknown) {
    if (!(error instanceof ApiError && error.isNetworkError)) return false;
    const { documentId } = get();
    const voices = queryClient.getQueryData<{ voices: { id: string; language: Lang; tier: ReaderData['tiers'][Lang]; expressive: boolean }[] }>(voicesKey)?.voices;
    const voice = voices?.find((v) => v.id === voiceId);
    const downloaded = documentId ? offlineFiles.get(documentId) : null;
    if (!voice || (voice.tier !== 'phone' && downloaded?.voices[voice.language] !== voiceId)) return false;
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
    set({ ...initialPlayerState, speed: get().speed });
  }
}

export const audioEngine = new AudioEngine();
