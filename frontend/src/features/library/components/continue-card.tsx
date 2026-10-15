import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Spinner } from 'heroui-native';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PlayPauseIcon } from '@/components/ui/play-pause-icon';
import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { formatMinutes, usePlayerTimeline } from '@/features/player/hooks/use-player';
import { usePlayerStore } from '@/features/player/store/player.store';
import { usePressScale } from '@/lib/use-press-scale';
import { useTokens } from '@/lib/use-tokens';

import { useDocuments } from '../hooks/use-documents';
import { useShelfUi } from '../store/shelf-ui.store';
import type { DocumentSummary } from '../types';
import { DocumentCover } from './document-cover';

/**
 * The shelf's one filled card, and its player: what's in the player now, or
 * else what you were last hearing, with its cover, how much is left, how far in
 * you are, and play or pause. While it's on the page the mini player above the
 * tabs steps aside, so there's only ever one. Hidden when there's nothing to continue.
 */
export function ContinueCard() {
  const loaded = usePlayerStore((s) => (s.status === 'ready' ? s.document : null));
  const { data } = useDocuments({ category: 'all', sort: 'progress' });
  const last = data?.items.find((d) => d.status === 'READY' && d.progress && !d.progress.completedAt) ?? null;
  const doc = loaded ?? last;

  // The mini player needs to know this card is here
  const shown = !!doc;
  useEffect(() => {
    useShelfUi.getState().setCardShown(shown);
    return () => useShelfUi.getState().setCardShown(false);
  }, [shown]);

  if (!doc) return null;
  return loaded ? <Card doc={doc} live /> : <Card doc={doc} />;
}

function Card({ doc, live }: { doc: DocumentSummary; live?: boolean }) {
  const t = useTokens();
  const press = usePressScale(0.98);
  const playPress = usePressScale(0.9);
  const playing = usePlayerStore((s) => !!live && s.isPlaying);
  const waiting = usePlayerStore((s) => !!live && s.isBuffering && !s.isPlaying);

  const open = () => {
    void audioEngine.open(doc.id, { autoplay: false });
    router.push('/player');
  };

  return (
    <Animated.View style={press.style}>
      <Pressable
        onPress={open}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${live ? 'Now playing' : 'Continue'}: ${doc.title}. Opens the player`}
        className="overflow-hidden rounded-[28px]"
        style={{ boxShadow: `0px 14px 30px ${t.heroTo}47` }}
      >
        <LinearGradient colors={[t.heroFrom, t.heroTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', gap: 16, padding: 16 }}>
          <DocumentCover document={doc} width={84} />
          <View className="flex-1 justify-between py-0.5">
            <View className="gap-1">
              <Text className="text-[19px] font-bold leading-[25px] tracking-[-0.3px] text-white" numberOfLines={2}>{doc.title}</Text>
              {live ? <LiveLeft author={doc.author} /> : <Left author={doc.author} text={`${formatMinutes(doc.estimatedDurationSec * (1 - fractionOf(doc)))} left`} />}
            </View>
            <View className="flex-row items-center gap-3.5">
              {live ? <LiveBar /> : <Bar fraction={fractionOf(doc)} />}
              <Animated.View style={playPress.style}>
                <Pressable
                  onPress={() => (live ? audioEngine.toggle() : void audioEngine.open(doc.id))}
                  onPressIn={playPress.onPressIn}
                  onPressOut={playPress.onPressOut}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={playing ? 'Pause' : 'Play'}
                  className="size-12 items-center justify-center rounded-full bg-white"
                >
                  {waiting ? <Spinner size="sm" color={t.heroTo} /> : <PlayPauseIcon playing={playing} size={19} color={t.heroTo} />}
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const fractionOf = (doc: DocumentSummary) => Math.min(Math.max(doc.progress?.fraction ?? 0, 0), 1);

function Left({ author, text }: { author: string | null; text: string }) {
  return <Text className="text-[13px] font-medium text-white/75" numberOfLines={1}>{author ? `${author}, ${text}` : text}</Text>;
}

function Bar({ fraction }: { fraction: number }) {
  return (
    <View className="h-1 flex-1 overflow-hidden rounded-full bg-white/25" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}>
      <View className="h-1 rounded-full bg-white" style={{ width: `${fraction * 100}%` }} />
    </View>
  );
}

// What's in the player moves as it plays. These two follow it, so the rest of the card doesn't redraw ten times a second.
function LiveLeft({ author }: { author: string | null }) {
  const { positionMs, totalMs, speed } = usePlayerTimeline();
  const finished = usePlayerStore((s) => s.finished);
  return <Left author={author} text={finished ? 'Finished' : `${formatMinutes((totalMs - positionMs) / 1000 / speed)} left`} />;
}

function LiveBar() {
  const { positionMs, totalMs } = usePlayerTimeline();
  return <Bar fraction={totalMs ? Math.min(positionMs / totalMs, 1) : 0} />;
}
