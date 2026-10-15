import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { usePressScale } from '@/lib/use-press-scale';
import { useTokens } from '@/lib/use-tokens';

import type { PageId } from '../api/studio.api';
import { PlatformTile } from '../lib/platform-look';

const PAGES: PageId[] = ['tiktok', 'meta', 'youtube'];
// The caption on the little phone, lit a word at a time as the subtitles are
const CAPTION = ['Wait', 'till', 'the', 'end'];
const WORD_MS = 520;

/**
 * Studio's banner for the people the app is made for: creators on TikTok, Reels and YouTube.
 * Edge to edge across the page; it opens the page for social videos.
 */
export function SocialBanner({ gutter }: { gutter: number }) {
  const t = useTokens();
  const press = usePressScale(0.985);
  return (
    <Animated.View style={[press.style, { marginHorizontal: -gutter }]}>
      <Pressable
        onPress={() => router.push('/social')}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel="For creators: make narration for TikTok, Reels and YouTube, with styles, captions, hashtags and subtitles for each"
      >
        <LinearGradient colors={[t.heroTo, t.heroFrom]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ overflow: 'hidden', paddingHorizontal: gutter, paddingTop: 22, paddingBottom: 20, gap: 18 }}>
          {/* Soft glows in the platforms' warm colours */}
          <View pointerEvents="none" className="absolute -right-16 -top-20 size-64 rounded-full" style={{ backgroundColor: '#ff4fa3', opacity: 0.28 }} />
          <View pointerEvents="none" className="absolute -bottom-24 -left-10 size-56 rounded-full" style={{ backgroundColor: '#ffffff', opacity: 0.07 }} />

          <View className="flex-row gap-4">
            <View className="flex-1 gap-2.5">
              <View className="self-start rounded-full bg-white/15 px-2.5 py-1">
                <Text className="text-[11px] font-bold uppercase tracking-[1.2px] text-white">For creators</Text>
              </View>
              <Text className="text-[25px] font-extrabold leading-[30px] tracking-[-0.5px] text-white">Make narration for TikTok, Reels and YouTube</Text>
              <Text className="text-[14px] leading-[20px] text-white/80">Styles, captions, hashtags and subtitles made for each one.</Text>
            </View>
            <Phone />
          </View>

          <View className="flex-row items-center justify-between">
            <View className="flex-row">
              {PAGES.map((p, i) => (
                <View key={p} style={{ marginLeft: i ? -8 : 0 }}>
                  <PlatformTile page={p} size={34} ring="#ffffff" />
                </View>
              ))}
            </View>
            <View className="flex-row items-center gap-1.5 rounded-full bg-white px-4 py-2.5">
              <Text className="text-[15px] font-bold" style={{ color: t.heroTo }}>Start creating</Text>
              <ArrowRight size={17} color={t.heroTo} strokeWidth={2.4} />
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

/** A vertical video in miniature: big centred captions, a word lit at a time, over a voice */
function Phone() {
  const still = useReducedMotion();
  const focused = useIsFocused();
  const [word, setWord] = useState(1);
  useEffect(() => {
    if (still || !focused) return;
    const timer = setInterval(() => setWord((n) => (n + 1) % CAPTION.length), WORD_MS);
    return () => clearInterval(timer);
  }, [still, focused]);

  return (
    <View
      className="w-[86px] items-center justify-between rounded-[20px] border-[1.5px] border-white/35 bg-black/25 px-2 pb-3 pt-2"
      style={{ height: 150, transform: [{ rotate: '5deg' }], marginTop: 4 }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View className="h-1 w-6 rounded-full bg-white/40" />
      <Text className="text-center text-[15px] font-black leading-[18px] text-white">
        {CAPTION.map((w, i) => (
          <Text key={w} className="text-[15px] font-black" style={{ color: i === word ? '#ffe14d' : '#ffffff' }}>
            {i ? ` ${w}` : w}
          </Text>
        ))}
      </Text>
      <View className="h-4 flex-row items-center gap-[3px]">
        {[5, 10, 14, 8, 12, 6, 10, 4].map((h, i) => (
          <View key={i} className="w-[3px] rounded-full bg-white/75" style={{ height: h }} />
        ))}
      </View>
    </View>
  );
}
