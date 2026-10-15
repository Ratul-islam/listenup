import { LinearGradient } from 'expo-linear-gradient';
import { Clapperboard, Music2, TvMinimalPlay } from 'lucide-react-native';
import { View } from 'react-native';

import type { PageId } from '../api/studio.api';

/**
 * Each platform's colours, glyph and short names: the platforms' own feel, not their logos.
 * `edge`: near-black, so it gets a faint rim to stand off a dark page.
 */
export const LOOKS: Record<PageId, { colors: [string, string, ...string[]]; Icon: typeof Music2; name: string; covers: string; edge?: boolean }> = {
  tiktok: { colors: ['#111827', '#1f2937'], Icon: Music2, name: 'TikTok', covers: 'Short videos', edge: true },
  meta: { colors: ['#f58529', '#dd2a7b', '#8134af'], Icon: Clapperboard, name: 'Reels', covers: 'Instagram, FB' },
  youtube: { colors: ['#ff4e45', '#d81e17'], Icon: TvMinimalPlay, name: 'YouTube', covers: 'Shorts and long' },
};

/** A platform page's tile: its colours with its glyph in white */
export function PlatformTile({ page, size = 48, ring }: { page: PageId; size?: number; ring?: string }) {
  const { colors, edge } = LOOKS[page];
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size * 0.3, alignItems: 'center', justifyContent: 'center', ...(ring ? { borderWidth: 2, borderColor: ring } : null) }}
    >
      {edge && !ring ? <DarkRim radius={size * 0.3} /> : null}
      <Glyph page={page} size={size * 0.46} />
    </LinearGradient>
  );
}

/** A platform's glyph in white; TikTok's with its cyan and pink shadows */
export function Glyph({ page, size }: { page: PageId; size: number }) {
  const { Icon } = LOOKS[page];
  if (page !== 'tiktok') return <Icon size={size} color="#ffffff" />;
  const shift = Math.max(1, size * 0.07);
  return (
    <View style={{ width: size, height: size }}>
      <View className="absolute" style={{ left: -shift, top: -shift * 0.5 }}>
        <Icon size={size} color="#25f4ee" />
      </View>
      <View className="absolute" style={{ left: shift, top: shift * 0.5 }}>
        <Icon size={size} color="#fe2c55" />
      </View>
      <Icon size={size} color="#ffffff" />
    </View>
  );
}

/** A faint light rim, only on a dark page */
export function DarkRim({ radius }: { radius: number }) {
  return <View pointerEvents="none" className="absolute inset-0 dark:border dark:border-white/20" style={{ borderRadius: radius }} />;
}

/** "0:15–0:30" or "5–20 min": how long a style usually runs */
export function lengthLabel([from, to]: [number, number]) {
  if (to >= 300) return `${Math.round(from / 60)}–${Math.round(to / 60)} min`;
  return `${from}–${to} s`;
}
