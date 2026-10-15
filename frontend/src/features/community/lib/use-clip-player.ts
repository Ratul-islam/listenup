import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useRef, useState } from 'react';

import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';

import { communityApi } from '../api/community.api';

export type ClipPlayer = ReturnType<typeof useClipPlayer>;

/**
 * One player for every voice clip on screen: tap to hear, tap again to stop.
 * Each clip's link is fetched once (the first play counts as a listen).
 */
export function useClipPlayer() {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const urls = useRef(new Map<string, string>());
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  // No pause on unmount: the player is freed first, which already stops it
  const toggle = async (id: string) => {
    if (current === id && status.playing) return player.pause();
    if (usePlayerStore.getState().isPlaying) audioEngine.pause();
    if (current === id && player.isLoaded) {
      // Paused part-way: carry on; finished: from the start
      if (status.duration && status.currentTime >= status.duration - 0.2) await player.seekTo(0);
      return player.play();
    }
    setCurrent(id);
    setLoading(id);
    try {
      let url = urls.current.get(id);
      if (!url) {
        url = (await communityApi.clipAudio(id)).url;
        urls.current.set(id, url);
      }
      player.replace({ uri: url });
      player.play();
    } finally {
      setLoading(null);
    }
  };

  return {
    /** The clip that's sounding now */
    playingId: status.playing ? current : null,
    loadingId: loading,
    toggle,
  };
}
