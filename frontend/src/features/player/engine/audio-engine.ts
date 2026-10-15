import {
  clearAllPreloadedSources,
  clearPreloadedSource,
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
import { voicesApi, type Voice, type VoiceTier } from '@/features/voices/api/voices.api';
import { voicesKey } from '@/features/voices/hooks/use-voices';
import { ApiError, getErrorMessage, hasErrorCode } from '@/lib/api/api-error';
import { queryClient } from '@/lib/query-client';
import { noteFinishedDocument } from '@/lib/review-prompt';
import { setActivePronunciations, speakable } from '@/features/pronunciations/lib/pronounce';
import { phoneVoice } from '@/modules/phone-voice';

import { playbackApi, type ChunkAudio } from '../api/playback.api';
import { spokenLineStart } from '../hooks/use-sync-position';
import { knownAnchors, msAtChar, type TextAnchor } from '../lib/sync';
import { chunkDuration, globalPosition, initialPlayerState, locate, timeline, usePlayerStore, type AudioSource } from '../store/player.store';

/** How the app plays audio; put back after anything that records */
export const PLAYBACK_AUDIO_MODE = { playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix', allowsRecording: false } as const;

const REPORT_EVERY_MS = 15_000;
const SKIP_MS = 15_000;
// How often the player says where it is; the word highlight is only as fine as this
const STATUS_EVERY_MS = 100;
// After a new file goes in, the player may still report the old one's clock for a moment.
// A position counts as the new file's once it's this close to where the file was started,
// or after this long whatever it says. A file started part-way in is first moved to that place:
// until that's been asked for, nothing it reports counts (it would be its own beginning).
const FRESH_WITHIN_MS = 700;
const FRESH_AFTER_MS = 1500;

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
  /** The document the notification is up for */
  private lockScreenFor: string | null = null;
  /** Files preloaded into memory; expo-audio keeps each until it's let go */
  private preloaded = new Set<string>();
  /** The player's clock belongs to the part on screen (false from asking for a part until its file is playing) */
  private live = false;
  /** Where the file last put in the player was started, and when (0: none since the part was asked for) */
  private startedAtMs = 0;
  private swappedAt = 0;
  /** The file in the player starts part-way in and hasn't been moved there yet */
  private awaitingSeek = false;
  private voiceToken = 0;
  /** Parts whose emotions changed since their audio was loaded */
  private edited = new Set<number>();
  /** Playback was stopped so a voice's sample could be heard; it carries on afterwards */
  private heldForPreview = false;

  /** Fetches a file into memory ahead of time, so swapping to it is near-instant */
  private preloadFile(uri: string) {
    this.preloaded.add(uri);
    void preload({ uri }).catch(() => {});
  }

  /**
   * Plays a file next, from `startMs` into it. Once it's in the player its preloaded copy isn't needed, so it goes.
   * The notification is told where this file starts in the document as it goes in.
   */
  private swapTo(player: AudioPlayer, uri: string, startMs: number) {
    this.expectAt(startMs);
    this.awaitingSeek = startMs > 0;
    player.replace({ uri });
    this.updateLockScreen();
    if (this.preloaded.delete(uri)) void clearPreloadedSource({ uri }).catch(() => {});
  }

  /** The player is about to jump within its file: positions from before the jump don't count */
  private expectAt(ms: number) {
    this.live = false;
    this.awaitingSeek = false;
    this.startedAtMs = ms;
    this.swappedAt = Date.now();
  }

  /** Moves a file just put in the player to where it starts, once it has loaded (a move asked for sooner is ignored) */
  private async startAt(player: AudioPlayer, offsetMs: number, wanted: () => boolean) {
    await this.waitUntilLoaded(player);
    if (!wanted()) return false;
    // What it reports from here is the new place (the move's own report can come back before the call does),
    // and the wait for a position that isn't near it starts now, not when the file went in
    this.expectAt(offsetMs);
    await player.seekTo(offsetMs / 1000);
    return wanted();
  }

  private releasePreloaded() {
    this.preloaded.clear();
    void clearAllPreloadedSources().catch(() => {});
  }

  private async ensurePlayer() {
    if (!this.configured) {
      await setAudioModeAsync(PLAYBACK_AUDIO_MODE);
      AppState.addEventListener('change', (s) => s !== 'active' && void this.report());
      // Android 13+ needs this for the media notification / lock-screen controls
      void requestNotificationPermissionsAsync().catch(() => {});
      this.configured = true;
    }
    if (!this.player) {
      this.player = createAudioPlayer(null, { updateInterval: STATUS_EVERY_MS, keepAudioSessionActive: true });
      this.player.addListener('playbackStatusUpdate', this.onStatus);
      // A drag or skip in the notification: a place in the whole document, which may be in another part
      this.player.addListener('remoteSeek', ({ positionMs }) => void this.seek(positionMs));
    }
    return this.player;
  }

  private onStatus = (status: AudioStatus) => {
    const now = Date.now();
    if (status.playing && this.lastTick) this.listenedMs += now - this.lastTick;
    this.lastTick = status.playing ? now : null;

    // While a part loads, the player still holds the one before: its clock and its ending aren't this part's
    if (!this.live) {
      const near = Math.abs(status.currentTime * 1000 - this.startedAtMs) <= FRESH_WITHIN_MS;
      const fresh = this.swappedAt > 0 && !this.awaitingSeek && status.isLoaded && (near || now - this.swappedAt > FRESH_AFTER_MS);
      if (!fresh) return void set({ isPlaying: status.playing });
      this.live = true;
    }

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

  /** Whether this phone voices a part itself (its own voice, or a Natural voice downloaded to it) instead of playing the server's audio */
  private madeOnPhone(index: number) {
    const { chunks, speed } = get();
    const { voice, tier } = this.partVoice(index);
    if (tier === 'phone') return true;
    // Where characters speak, the server makes it
    return tier === 'natural' && !chunks[index]?.expressions.speakers?.length && !!onDeviceVoice.speakerFor(voice, speed);
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
      // The phone voices a part in one voice. Where characters speak, the server makes it, so they
      // get their own; if it can't right now, the phone reads the part rather than stopping.
      const cast = !!chunk?.expressions.speakers?.length;
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
          : chunk && speaker && !cast
            ? this.deviceAudio(chunk, voice, speaker)
            : chunk && speaker
              ? fromServer(playbackApi.audio(documentId!, index, voiceId ?? undefined)).catch(() => this.deviceAudio(chunk, voice, speaker))
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
      // The timeline, and the highlight's timing, firm up as parts are voiced
      if (get().documentId !== documentId || this.voiceFor(chunk.index) !== voiceId) return;
      set((s) => ({
        chunks: s.chunks.map((c) => (c.index === chunk.index ? { ...c, durationMs } : c)),
        ...(s.playing?.index === chunk.index && this.device?.chunk === device && { playing: { index: chunk.index, durationMs, anchors: device.anchors() } }),
      }));
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
        this.swapTo(player, clip.uri, offset);
        player.setPlaybackRate(get().speed, 'high');
        if (offset > 0 && !(await this.startAt(player, offset, wanted))) return;
        if (autoplay) player.play();
        // Have the next part ready to swap in
        if (i + 1 < current.chunk.parts.length) {
          current.chunk
            .clip(i + 1)
            .then((next) => {
              if (next.uri) this.preloadFile(next.uri);
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
        if (audio.url) this.preloadFile(audio.url);
      })
      .catch(() => {});
  }

  private async loadChunk(index: number, offsetMs: number, autoplay: boolean) {
    const token = ++this.loadToken;
    this.live = false;
    this.swappedAt = 0;
    const player = await this.ensurePlayer();
    set({ chunkIndex: index, positionMs: offsetMs, isBuffering: true, finished: false, error: null, errorCode: null });

    try {
      const audio = await this.audioFor(index);
      if (token !== this.loadToken) return;

      // Real duration replaces the estimate so the timeline tightens up, and the highlight gets this audio's timing
      const durationMs = audio.device ? audio.device.estimatedMs() : audio.durationMs;
      // A download is the server's audio saved: what's known of that audio's timing is this file's too
      const part = get().chunks[index];
      const saved = audio.source === 'download' && part?.durationMs === audio.durationMs ? knownAnchors(part) : null;
      const anchors: TextAnchor[] | null = audio.device ? audio.device.anchors() : (audio.anchors ?? saved);
      const settle = () => {
        this.edited.delete(index);
        set((s) => ({
          source: audio.source,
          playing: { index, durationMs, anchors },
          switchingTo: null,
          // The part remembers its audio's timing, so coming back to it shows the right line before it has loaded again.
          // Not for a part voiced on the phone piece by piece: its timing is still firming up.
          chunks: s.chunks.map((c) => (c.index === index ? { ...c, durationMs, anchors: audio.device ? null : anchors } : c)),
        }));
      };

      this.device = null;
      if (audio.device) {
        settle();
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

      // Swapped in before anything on screen updates, so the gap between parts stays short
      this.swapTo(player, audio.url, offsetMs);
      player.setPlaybackRate(get().speed, 'high');
      // The highlight needs this audio's timing from its first moment, before any wait below
      settle();
      if (offsetMs > 0 && !(await this.startAt(player, offsetMs, () => token === this.loadToken))) return;
      if (autoplay) player.play();
      this.updateLockScreen();
      this.warmNext(index + 1);
    } catch (error) {
      if (token !== this.loadToken) return;
      if (this.fallBackToPhone(index, error)) return void this.loadChunk(index, offsetMs, autoplay);
      player.pause();
      set({ isBuffering: false, isPlaying: false, switchingTo: null, error: getErrorMessage(error), errorCode: codeOf(error) });
    }
  }

  /**
   * Loads a part and starts it at a character (the start of a line), once its
   * audio says when that line is spoken. For audio that's about to be made
   * again: a new voice, or new emotions.
   */
  private async loadChunkAtChar(index: number, char: number, autoplay: boolean) {
    const chunk = get().chunks[index];
    if (!chunk) return;
    if (char <= 0) return this.loadChunk(index, 0, autoplay);
    const token = ++this.loadToken;
    this.live = false;
    this.swappedAt = 0;
    // What's playing is about to be replaced: stop it now, so the change is heard as one
    this.player?.pause();
    set({
      chunkIndex: index,
      playing: null,
      // Read back the same way the highlight reads it, so it stays on this line while the new audio is made
      positionMs: msAtChar(chunk.text.length, chunkDuration(chunk), knownAnchors(chunk), char),
      isBuffering: true,
      finished: false,
      error: null,
      errorCode: null,
    });
    try {
      const audio = await this.audioFor(index);
      if (token !== this.loadToken) return;
      const durationMs = audio.device ? audio.device.estimatedMs() : audio.durationMs;
      const anchors = audio.device ? audio.device.anchors() : (audio.anchors ?? null);
      // The part takes its new audio's timing first, so the place worked out from it is read back as the same line
      set((s) => ({ chunks: s.chunks.map((c) => (c.index === index ? { ...c, durationMs, anchors: audio.device ? null : anchors } : c)) }));
      await this.loadChunk(index, msAtChar(chunk.text.length, durationMs, anchors, char), autoplay);
    } catch (error) {
      if (token !== this.loadToken) return;
      if (this.fallBackToPhone(index, error)) return void this.loadChunk(index, 0, autoplay);
      set({ isBuffering: false, isPlaying: false, switchingTo: null, error: getErrorMessage(error), errorCode: codeOf(error) });
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

  /**
   * The notification and lock screen show the whole document, not the one part
   * in the player: its length (estimated for parts not voiced yet), and where
   * the file playing starts in it. Android only; it needs the expo-audio patch
   * in `patches/`, without which the bar shows the part alone.
   */
  private updateLockScreen() {
    const { document, chunks, chunkIndex } = get();
    if (!this.player || !document) return;
    const { starts, total } = timeline(chunks);
    const metadata = {
      title: document.title,
      artist: document.author ?? 'ListenUp',
      albumTitle: 'ListenUp',
      timelineDurationMs: total,
      // A part voiced on the phone plays as several files
      timelineOffsetMs: (starts[chunkIndex] ?? 0) + (this.device?.index === chunkIndex ? this.device.startMs : 0),
    };
    // Once per document; after that only what it shows changes, so the controls stay put between parts
    if (this.lockScreenFor === document.id) return this.player.updateLockScreenMetadata(metadata);
    this.player.setActiveForLockScreen(true, metadata, { showSeekBackward: true, showSeekForward: true });
    this.lockScreenFor = document.id;
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
    // The same document again (in another voice): its place is saved before it's read back. Another
    // document: what was playing stops now, and its place is saved on the way, without waiting for it.
    if (state.documentId === documentId) await this.report();
    else if (state.documentId) {
      this.player?.pause();
      void this.report();
    }

    this.urls.clear();
    this.releasePreloaded();
    this.device = null;
    this.edited.clear();
    this.voiceToken++;
    onDeviceVoice.dropQueued();
    set({ ...initialPlayerState, status: 'loading', documentId, speed: state.speed });
    // Natural voices on the phone: load the model while the document loads
    if (isOnDeviceActive(useOnDeviceStore.getState())) onDeviceVoice.warmUp();
    try {
      const reader = await this.loadReader(documentId, voiceId);
      setActivePronunciations(reader.pronunciations);
      const progress = reader.document.progress;
      const restart = !!progress?.completedAt;
      const chunkIndex = restart ? 0 : (progress?.chunkIndex ?? 0);
      const positionMs = restart ? 0 : (progress?.offsetMs ?? 0);
      set({
        status: 'ready',
        document: reader.document,
        chunks: reader.chunks,
        cast: reader.cast ?? [],
        voices: reader.voices,
        expressive: reader.expressive,
        tiers: reader.tiers,
        voiceId: voiceId ?? progress?.voiceId ?? null,
        speed: reader.speed,
        // Where to carry on from goes in with the document: the page opens on that line, never at the top first
        chunkIndex,
        positionMs,
        isBuffering: true,
      });
      // The timing sent with the document is the server's audio; a part this phone voices itself has its own
      if (this.madeOnPhone(chunkIndex)) set((s) => ({ chunks: s.chunks.map((c) => (c.index === chunkIndex ? { ...c, anchors: null } : c)) }));
      this.startReporting();
      await this.loadChunk(chunkIndex, positionMs, autoplay);
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
    this.heldForPreview = false;
    const { finished, error, chunkIndex, positionMs } = get();
    if (finished) return void this.loadChunk(0, 0, true);
    if (error) return void this.loadChunk(chunkIndex, positionMs, true);
    // Its emotions changed while it was paused: voice it again, from the line it stopped on
    if (this.edited.has(chunkIndex)) return void this.loadChunkAtChar(chunkIndex, spokenLineStart(), true);
    this.player?.play();
  }

  pause() {
    this.heldForPreview = false;
    this.player?.pause();
    void this.report();
  }

  /**
   * Stops playback while a voice's sample is heard (the voice list's ▶).
   * Choosing a voice then starts the new one playing; leaving the list
   * without choosing carries on as before.
   */
  holdForPreview() {
    if (!get().isPlaying) return;
    this.heldForPreview = true;
    this.player?.pause();
  }

  /**
   * A character's voice is about to change (every character's, with no name):
   * if a part with their lines is playing, it stops now instead of talking on
   * in the old voice while the change is saved. True if it was stopped; the
   * caller then calls play(), which voices the part again from the line it was on.
   */
  holdForCast(name?: string) {
    const { chunks, chunkIndex, isPlaying } = get();
    const speakers = chunks[chunkIndex]?.expressions.speakers ?? [];
    if (!isPlaying || !speakers.some((s) => !name || s.name === name)) return false;
    this.player?.pause();
    // Said now, not at the player's next report, so what follows knows it's stopped
    set({ isPlaying: false });
    return true;
  }

  /** The voice list has closed: carry on, unless a new voice is already on its way */
  releasePreview() {
    if (!this.heldForPreview) return;
    const { switchingTo, isPlaying, isBuffering } = get();
    if (!switchingTo && !isPlaying && !isBuffering) this.play();
    this.heldForPreview = false;
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
    if (device && device.index === chunkIndex && target.index === chunkIndex && this.player && this.swappedAt > 0) {
      // Inside the part playing: just move; otherwise find (and maybe voice) the part
      const partMs = (this.player.duration || 0) * 1000;
      if (target.offsetMs >= device.startMs && target.offsetMs < device.startMs + partMs) {
        this.expectAt(target.offsetMs - device.startMs);
        set({ positionMs: target.offsetMs, finished: false });
        await this.player.seekTo((target.offsetMs - device.startMs) / 1000);
        return;
      }
    }
    // Sentences queued for parts nobody will hear now
    if (target.index !== chunkIndex) onDeviceVoice.dropQueued();
    if (!device && target.index === chunkIndex && this.player && this.swappedAt > 0) {
      this.expectAt(target.offsetMs);
      set({ positionMs: target.offsetMs, finished: false });
      await this.player.seekTo(target.offsetMs / 1000);
    } else {
      await this.loadChunk(target.index, target.offsetMs, isPlaying || get().finished);
    }
  }

  /**
   * Jumps to a line: a character of a part (a tap in the full text). In the
   * part playing it's a move to when that line is really spoken; in another
   * part, that part is loaded first, since only its audio says when the line comes.
   */
  async seekToLine(index: number, char: number) {
    const { chunks, chunkIndex, playing, isPlaying, finished } = get();
    const chunk = chunks[index];
    if (!chunk) return;
    if (index === chunkIndex && playing?.index === index && this.swappedAt > 0 && !this.edited.has(index)) {
      return this.seek(timeline(chunks).starts[index] + msAtChar(chunk.text.length, playing.durationMs, playing.anchors, char));
    }
    if (index !== chunkIndex) onDeviceVoice.dropQueued();
    await this.loadChunkAtChar(index, char, isPlaying || finished);
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

  /** A voice from the list the app already has, if it has it */
  private knownVoice(voiceId: string) {
    return queryClient.getQueryData<{ voices: Voice[] }>(voicesKey)?.voices.find((v) => v.id === voiceId);
  }

  /**
   * Switches the document to another voice, from the line being heard. The old
   * voice stops at once and the new one's audio is asked for straight away;
   * the document's details for the new voice (real lengths, which parts keep
   * their own voice) follow in the background. Of several quick picks, the last wins.
   * It plays if it was playing, including when it was only stopped to hear a
   * voice's sample first.
   */
  async setVoice(voiceId: string) {
    const { documentId, chunkIndex, isPlaying, isBuffering } = get();
    if (!documentId) return;
    const token = ++this.voiceToken;
    const resume = isPlaying || isBuffering || this.heldForPreview;
    this.heldForPreview = false;
    const line = spokenLineStart();
    const voice = this.knownVoice(voiceId);

    this.loadToken++;
    this.player?.pause();
    this.urls.clear();
    this.releasePreloaded();
    this.device = null;
    this.edited.clear();
    onDeviceVoice.dropQueued();
    set({ switchingTo: voiceId, isBuffering: true, isPlaying: false, error: null, errorCode: null });

    // The voice is known: its audio can be asked for before the document's details arrive
    if (voice) {
      set((s) => ({
        voiceId,
        voices: { ...s.voices, [voice.language]: voice.id },
        tiers: { ...s.tiers, [voice.language]: voice.tier },
        expressive: { ...s.expressive, [voice.language]: voice.expressive },
        // Lengths were the old voice's
        chunks: s.chunks.map((c) => (c.language === voice.language && !c.ownVoiceId ? { ...c, durationMs: null, voiceId: voice.id, tier: voice.tier, expressive: voice.expressive } : c)),
      }));
      void this.loadChunkAtChar(chunkIndex, line, resume);
    }

    try {
      const reader = await documentsApi.script(documentId, voiceId);
      if (token !== this.voiceToken || get().documentId !== documentId) return;
      setActivePronunciations(reader.pronunciations);
      const { playing } = get();
      set({
        voiceId,
        voices: reader.voices,
        expressive: reader.expressive,
        tiers: reader.tiers,
        // A new narrator recasts the characters to match its level
        cast: reader.cast ?? [],
        // The part in the player keeps the length, and the timing, its audio really has
        chunks: reader.chunks.map((c) => (playing?.index === c.index ? { ...c, durationMs: playing.durationMs, anchors: playing.anchors } : c)),
      });
      if (!voice) await this.loadChunkAtChar(Math.min(chunkIndex, Math.max(reader.chunks.length - 1, 0)), line, resume);
      void this.report();
    } catch (error) {
      if (token !== this.voiceToken) return;
      // Already switched and playing (e.g. offline, with a voice this phone can make): nothing to undo
      if (voice && error instanceof ApiError && error.isNetworkError) return;
      if (!voice && this.switchVoiceOffline(voiceId, error)) return void this.loadChunkAtChar(chunkIndex, line, resume);
      if (!voice) set({ switchingTo: null, isBuffering: false, error: getErrorMessage(error) });
    }
  }

  /** The Voices page changed who reads a language: the open document follows, if it has that language */
  followPreferredVoice(voice: Pick<Voice, 'id' | 'language'>) {
    const { documentId, chunks, voices } = get();
    if (!documentId || voices[voice.language] === voice.id || !chunks.some((c) => c.language === voice.language)) return;
    void this.setVoice(voice.id);
  }

  /**
   * No connection: switch voices without the server when this device can still
   * play the new one, i.e. it's the phone voice, a Natural voice made on this
   * phone, or the voice the download used.
   */
  private switchVoiceOffline(voiceId: string, error: unknown) {
    if (!(error instanceof ApiError && error.isNetworkError)) return false;
    const { documentId } = get();
    const voice = this.knownVoice(voiceId);
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

  /** Whether the voice reading a part can act out emotions */
  takesEmotions(index: number) {
    const { chunks, expressive } = get();
    const chunk = chunks[index];
    if (!chunk) return false;
    return chunk.ownVoiceId && chunk.expressive !== undefined ? chunk.expressive : expressive[chunk.language];
  }

  /** New emotions for a chunk; it's re-voiced the next time it loads */
  setExpressions(index: number, expressions: ChunkExpressions) {
    // Voices that read plainly sound the same whatever the emotions, so their audio stays
    const changesSound = this.takesEmotions(index);
    if (changesSound) {
      this.forget(index);
      this.edited.add(index);
    }
    set((s) => ({
      // The part in the player keeps the length of the audio it's playing
      chunks: s.chunks.map((c) => (c.index === index ? { ...c, expressions, ...(changesSound && s.playing?.index !== index && { durationMs: null }) } : c)),
    }));
  }

  /** Re-voices a chunk and plays it from a character, so an edit can be heard right away */
  async replayFrom(index: number, char: number) {
    await this.loadChunkAtChar(index, char, true);
  }

  /**
   * A run of edits is finished (painting, say). If the part playing changed,
   * it's voiced again from the line being heard; otherwise the next part is
   * got ready, so there's no wait when it's reached.
   */
  commitEdits() {
    const { chunkIndex, isPlaying } = get();
    if (!this.edited.has(chunkIndex)) return this.warmNext(chunkIndex + 1);
    // Paused: it's voiced again when play is pressed
    if (isPlaying) void this.loadChunkAtChar(chunkIndex, spokenLineStart(), true);
  }

  /**
   * Takes in emotions changed in the background ("Make it expressive", "Remove
   * all"). Later parts are voiced again when they're reached. With `replay`,
   * the part playing is too, from the line being heard, so the change is
   * heard at once; otherwise it keeps its audio.
   */
  applyReader(reader: ReaderData, { replay = false } = {}) {
    const { chunkIndex, isPlaying, playing, source } = get();
    setActivePronunciations(reader.pronunciations);
    // The server no longer has current audio for the part playing: what's in the player is out of date
    const stale = replay && source === 'server' && playing?.index === chunkIndex && reader.chunks[chunkIndex]?.durationMs === null;
    this.forget(stale ? chunkIndex : chunkIndex + 1, Number.MAX_SAFE_INTEGER);
    set((s) => ({
      document: reader.document,
      cast: reader.cast ?? [],
      chunks: s.chunks.map((c, i) => {
        const fresh = reader.chunks[i];
        if (!fresh) return c;
        return i === chunkIndex && !stale ? { ...c, expressions: fresh.expressions } : fresh;
      }),
    }));
    if (stale && isPlaying) void this.loadChunkAtChar(chunkIndex, spokenLineStart(), true);
    else if (stale) this.edited.add(chunkIndex);
    else this.warmNext(chunkIndex + 1);
    return stale && isPlaying;
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
      set({ document: reader.document, chunks: reader.chunks, cast: reader.cast ?? [], chunkIndex: Math.min(chunkIndex, Math.max(reader.chunks.length - 1, 0)) });
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
    this.lockScreenFor = null;
    this.setSleepTimer(null);
    if (this.reportTimer) clearInterval(this.reportTimer);
    this.reportTimer = null;
    this.urls.clear();
    this.releasePreloaded();
    this.device = null;
    this.edited.clear();
    this.voiceToken++;
    this.live = false;
    this.heldForPreview = false;
    onDeviceVoice.dropQueued();
    set({ ...initialPlayerState, speed: get().speed });
  }
}

export const audioEngine = new AudioEngine();
