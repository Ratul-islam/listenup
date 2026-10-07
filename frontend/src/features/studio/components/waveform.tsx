import { memo } from 'react';
import { View } from 'react-native';

import { useTokens } from '@/lib/use-tokens';

interface WaveformProps {
  /** Loudness slices (0–100) measured from the real audio; null when not measured yet */
  peaks: number[] | null | undefined;
  /** Whether the part has audio in this voice at all */
  voiced: boolean;
  /** Share already played (0–1), drawn in the accent */
  progress?: number;
  height?: number;
  /** Bars drawn; the 48 measured slices are merged to fit */
  bars?: number;
}

const DOTS = 28;

/**
 * A part's waveform as Studio draws it. It's always the real audio: measured
 * bars once voiced, a plain line while it's being measured, and a dotted lane
 * for parts that will be voiced the next time they play or export.
 */
export const Waveform = memo(function Waveform({ peaks, voiced, progress = 0, height = 28, bars = 40 }: WaveformProps) {
  const t = useTokens();

  if (!voiced) {
    return (
      <View className="flex-row items-center justify-between" style={{ height }} accessibilityElementsHidden>
        {Array.from({ length: DOTS }, (_, i) => (
          <View key={i} className="rounded-full bg-border" style={{ width: 3, height: 3 }} />
        ))}
      </View>
    );
  }

  if (!peaks?.length) {
    return (
      <View className="justify-center" style={{ height }} accessibilityElementsHidden>
        <View className="rounded-full" style={{ height: 3, backgroundColor: t.periwinkle, opacity: 0.6 }} />
      </View>
    );
  }

  // Merge the measured slices into the bars that fit, keeping each one's loudest moment
  const per = peaks.length / bars;
  const levels = Array.from({ length: bars }, (_, b) => Math.max(...peaks.slice(Math.floor(b * per), Math.max(Math.floor((b + 1) * per), Math.floor(b * per) + 1))));
  const playedBars = Math.round(progress * bars);

  return (
    <View className="flex-row items-center" style={{ height, gap: 2 }} accessibilityElementsHidden>
      {levels.map((level, i) => (
        <View
          key={i}
          className="flex-1 rounded-full"
          style={{ height: Math.max(3, (level / 100) * height), backgroundColor: i < playedBars ? t.accent : t.periwinkle, opacity: i < playedBars ? 1 : 0.55 }}
        />
      ))}
    </View>
  );
});
