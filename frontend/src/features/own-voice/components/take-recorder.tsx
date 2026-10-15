import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Linking from 'expo-linking';
import { useToast } from 'heroui-native';
import { Mic, Pause, Play, RotateCcw, Square } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { audioEngine, PLAYBACK_AUDIO_MODE } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

/** One finished recording */
export interface Take {
  uri: string;
  seconds: number;
}

interface TakeRecorderProps {
  take: Take | null;
  onTake: (take: Take | null) => void;
  /** Shorter than this and it's recorded again */
  minSec: number;
  /** Recording stops by itself here */
  maxSec: number;
  /** Wording for other uses than reading a passage (defaults are for that) */
  labels?: { idle?: string; taken?: string; tooShort?: string };
}

// Speech, in one channel; the server turns it into what the voice is made from
const RECORDING = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, isMeteringEnabled: true };
// The microphone's level runs from about -60 dB (a quiet room) to 0 (as loud as it gets)
const QUIET_DB = -60;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * Records one take: tap the microphone, read, tap to stop. Then it can be
 * heard or recorded again. A take shorter than `minSec` isn't kept.
 */
export function TakeRecorder({ take, onTake, minSec, maxSec, labels }: TakeRecorderProps) {
  const t = useTokens();
  const { toast } = useToast();
  const recorder = useAudioRecorder(RECORDING);
  const state = useAudioRecorderState(recorder, 100);
  const player = useAudioPlayer(null);
  const playing = useAudioPlayerStatus(player).playing;
  const [busy, setBusy] = useState(false);
  const stopping = useRef(false);
  const seconds = state.durationMillis / 1000;

  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    const length = recorder.currentTime || seconds;
    try {
      await recorder.stop();
      haptics.tap();
      const uri = recorder.uri;
      if (!uri) throw new Error('The recording wasn’t saved. Try again.');
      if (length < minSec) {
        toast.show({ label: 'That was too short', description: labels?.tooShort ?? `Read all of it: it takes at least ${minSec} seconds.` });
        onTake(null);
      } else onTake({ uri, seconds: length });
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      stopping.current = false;
      void setAudioModeAsync(PLAYBACK_AUDIO_MODE).catch(() => {});
    }
  };

  // Long enough: stop by itself
  useEffect(() => {
    if (state.isRecording && seconds >= maxSec) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isRecording, seconds, maxSec]);

  // Leaving mid-recording puts playback back the way it was
  useEffect(() => () => void setAudioModeAsync(PLAYBACK_AUDIO_MODE).catch(() => {}), []);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        toast.show({
          label: 'ListenUp needs the microphone to record you',
          ...(permission.canAskAgain ? {} : { actionLabel: 'Open settings', onActionPress: () => void Linking.openSettings() }),
        });
        return;
      }
      if (playing) player.pause();
      if (usePlayerStore.getState().isPlaying) audioEngine.pause();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      haptics.tap();
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const hear = () => {
    if (!take) return;
    if (playing) return player.pause();
    player.replace({ uri: take.uri });
    player.play();
  };

  if (state.isRecording) {
    const level = Math.min(Math.max(((state.metering ?? QUIET_DB) - QUIET_DB) / -QUIET_DB, 0), 1);
    return (
      <View className="items-center gap-4">
        <View className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary" accessibilityElementsHidden>
          <View className="h-full rounded-full bg-accent" style={{ width: `${Math.round(level * 100)}%` }} />
        </View>
        <Pressable
          onPress={() => void stop()}
          accessibilityRole="button"
          accessibilityLabel="Stop recording"
          className="size-20 items-center justify-center rounded-full bg-danger active:opacity-80"
        >
          <Square size={26} color="#ffffff" fill="#ffffff" />
        </Pressable>
        <Text variant="caption" accessibilityLiveRegion="none">
          {clock(seconds)} · {seconds < minSec ? `keep going for at least ${clock(minSec)}` : `tap to stop when you’ve finished (stops at ${clock(maxSec)})`}
        </Text>
      </View>
    );
  }

  if (take) {
    return (
      <View className="flex-row items-center gap-3 rounded-2xl bg-surface-secondary p-3">
        <Pressable
          onPress={hear}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Stop' : 'Hear your recording'}
          className="size-11 items-center justify-center rounded-full bg-accent active:opacity-80"
        >
          {playing ? <Pause size={17} color={t.accentForeground} fill={t.accentForeground} /> : <Play size={17} color={t.accentForeground} fill={t.accentForeground} style={{ marginLeft: 2 }} />}
        </Pressable>
        <View className="flex-1">
          <Text className="text-[15px] font-semibold">Recorded · {clock(take.seconds)}</Text>
          <Text variant="caption">{labels?.taken ?? 'Listen back. Is it clear, with no noise behind you?'}</Text>
        </View>
        <Pressable
          onPress={() => {
            if (playing) player.pause();
            onTake(null);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Record it again"
          className="size-11 items-center justify-center rounded-full active:bg-default"
        >
          <RotateCcw size={19} color={t.foreground} />
        </Pressable>
      </View>
    );
  }

  return (
    <View className="items-center gap-3">
      <Pressable
        onPress={() => void start()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Start recording"
        className="size-20 items-center justify-center rounded-full bg-accent active:opacity-80"
      >
        <Mic size={30} color={t.accentForeground} />
      </Pressable>
      <Text variant="caption">{labels?.idle ?? 'Tap, then read it aloud'}</Text>
    </View>
  );
}
