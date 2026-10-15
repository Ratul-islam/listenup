import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Mic, Smartphone } from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/features/auth/store/auth.store';
import type { Lang } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import { initials } from '../voice-catalog';
import { VOICE_FACES } from '../voice-faces';

// For a voice without a picture: soft two-tone gradients; each keeps the same one everywhere
const GRADIENTS: [string, string][] = [
  ['#9b8cff', '#6a55e0'],
  ['#f9a8d4', '#db2777'],
  ['#7dd3fc', '#6366f1'],
  ['#6ee7b7', '#0d9488'],
  ['#fcd34d', '#f97316'],
  ['#c4b5fd', '#ec4899'],
  ['#93c5fd', '#2563eb'],
  ['#fda4af', '#e11d48'],
];
const PHONE_GRADIENT: [string, string] = ['#cbd5e1', '#64748b'];

const OWN_GRADIENT: [string, string] = ['#9b8cff', '#6a55e0'];

const gradientFor = (key: string) => GRADIENTS[[...key].reduce((n, c) => n + c.charCodeAt(0), 0) % GRADIENTS.length];

/** The listener's own voice ("mine", "mine-bn"): it wears their account picture */
const isOwn = (id?: string) => id === 'mine' || !!id?.startsWith('mine-');

/** A built-in voice's picture, found by its id, or by its name where only that is known */
const faceOf = (id: string | undefined, name: string) => VOICE_FACES[id ?? ''] ?? VOICE_FACES[name.toLowerCase()];

interface VoiceAvatarProps {
  name: string;
  /** Picks the picture; the name is used when it's left out */
  id?: string;
  language?: Lang;
  size?: number;
  /** A phone voice: a phone glyph on grey instead of a face */
  phone?: boolean;
  /** Its preview is playing: a moving waveform over the face */
  speaking?: boolean;
  /** Shows a check badge */
  selected?: boolean;
}

/**
 * A voice's face: its drawn portrait, the listener's own picture for their own
 * voice, a phone for the phone's voice, and initials for a voice with no
 * picture yet. A little waveform plays over it while it speaks.
 */
export function VoiceAvatar({ name, id, size = 44, phone, speaking, selected }: VoiceAvatarProps) {
  const t = useTokens();
  const own = isOwn(id);
  const myPicture = useAuthStore((s) => (own ? s.user?.avatarUrl : null));
  const face = phone || own ? null : faceOf(id, name);
  const picture = face ?? (myPicture ? { uri: myPicture } : null);
  const colors = phone ? PHONE_GRADIENT : own ? OWN_GRADIENT : gradientFor(id ?? name);
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={{ width: size, height: size }}>
      {picture ? (
        <View style={[round, { overflow: 'hidden', backgroundColor: t.accentSoftBg }]}>
          <Image source={picture} style={{ width: size, height: size }} contentFit="cover" accessibilityIgnoresInvertColors />
          {speaking ? (
            <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(27, 28, 46, 0.45)' }}>
              <MiniWave height={size * 0.42} />
            </View>
          ) : null}
        </View>
      ) : (
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[round, { alignItems: 'center', justifyContent: 'center' }]}>
          {speaking ? (
            <MiniWave height={size * 0.42} />
          ) : phone ? (
            <Smartphone size={size * 0.42} color="#ffffff" />
          ) : own ? (
            <Mic size={size * 0.42} color="#ffffff" />
          ) : (
            <Text className="font-bold text-white" style={{ fontSize: size * 0.36 }}>{initials(name)}</Text>
          )}
        </LinearGradient>
      )}
      {selected ? (
        <View
          className="absolute items-center justify-center rounded-full bg-accent"
          style={{ width: size * 0.4, height: size * 0.4, right: -2, bottom: -2, borderWidth: 2, borderColor: t.background }}
        >
          <Check size={size * 0.24} color={t.accentForeground} strokeWidth={3} />
        </View>
      ) : null}
    </View>
  );
}

const BARS = [0.55, 1, 0.7, 0.9, 0.5];

function WaveBar({ index, rest, height }: { index: number; rest: number; height: number }) {
  const scale = useSharedValue(rest);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) return;
    scale.value = withDelay(index * 90, withRepeat(withSequence(withTiming(1, { duration: 260 + index * 40 }), withTiming(0.3, { duration: 300 })), -1, true));
    return () => cancelAnimation(scale);
  }, [index, scale, reduceMotion]);
  const style = useAnimatedStyle(() => ({ height: Math.max(scale.value * height, 3) }));
  return <Animated.View style={[{ width: 3, borderRadius: 2, backgroundColor: '#ffffff' }, style]} />;
}

/** Five white bars bouncing, for "this voice is speaking" */
function MiniWave({ height }: { height: number }) {
  return (
    <View className="flex-row items-center gap-[3px]" style={{ height }} accessibilityElementsHidden>
      {BARS.map((rest, i) => (
        <WaveBar key={i} index={i} rest={rest} height={height} />
      ))}
    </View>
  );
}
