import { Pause, Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { GlassCard } from '@/components/ui/glass-card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import { VoiceAvatar } from '@/features/voices/components/voice-avatar';
import { useTokens } from '@/lib/use-tokens';

const PHRASES = ['"Focus isn\'t just saying yes,', "it's saying no to the", 'hundred other good ideas."'];
const START_SEC = 18;
const TOTAL_SEC = 84;
const PHRASE_MS = 1400;

interface SamplePlayerCardProps {
  onPlayingChange?: (playing: boolean) => void;
}

/** Onboarding demo: a voice "reading" a quote, the current phrase in the accent colour */
export function SamplePlayerCard({ onPlayingChange }: SamplePlayerCardProps) {
  const t = useTokens();
  const reduceMotion = useReducedMotion();
  const [playing, setPlaying] = useState(!reduceMotion);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    onPlayingChange?.(playing);
    if (!playing) return;
    const timer = setInterval(() => setTick((n) => n + 1), PHRASE_MS);
    return () => clearInterval(timer);
  }, [playing, onPlayingChange]);

  const phrase = tick % PHRASES.length;
  const elapsed = START_SEC + ((tick * 1.4) % (TOTAL_SEC - START_SEC));

  return (
    <GlassCard raised className="gap-4 p-5">
      <Text className="text-[18px] font-semibold leading-[27px] text-muted">
        {PHRASES.map((p, i) => (
          <Text key={i} className={i === phrase ? 'text-accent' : undefined}>
            {p}
            {i < PHRASES.length - 1 ? ' ' : ''}
          </Text>
        ))}
      </Text>
      <ProgressBar value={elapsed / TOTAL_SEC} height={3} />
      <View className="flex-row items-center gap-3">
        <VoiceAvatar name="Eleanor" size={40} />
        <View className="flex-1">
          <Text className="text-[15px] font-semibold">Eleanor</Text>
          <Text variant="caption">British English</Text>
        </View>
        <Pressable
          onPress={() => setPlaying((p) => !p)}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause sample' : 'Play sample'}
          className="size-12 items-center justify-center rounded-full bg-accent active:opacity-85"
        >
          {playing ? (
            <Pause size={19} color={t.accentForeground} fill={t.accentForeground} />
          ) : (
            <Play size={19} color={t.accentForeground} fill={t.accentForeground} style={{ marginLeft: 2 }} />
          )}
        </Pressable>
      </View>
    </GlassCard>
  );
}
