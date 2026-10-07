import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Spinner, useToast } from 'heroui-native';
import { Leaf, Pause, Play, Smartphone, Sparkles } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { isOnDeviceActive, useOnDeviceStore } from '@/features/on-device/on-device-voice';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { LANGUAGE_NAMES, LANGUAGE_NAMES_EN, type Lang } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import type { Voice, VoiceTier } from '../api/voices.api';
import { useVoices } from '../hooks/use-voices';
import { isMissingPhoneVoice, missingPhoneVoiceToast, previewUri } from '../lib/voice-preview';
import { VoiceAvatar } from './voice-avatar';

// Best first: what each level is, in one line
const TIERS: { tier: VoiceTier; title: string; detail: string; icon: (color: string) => ReactNode }[] = [
  { tier: 'expressive', title: 'Expressive', detail: 'Most lifelike, and they can laugh, whisper or cry', icon: (c) => <Sparkles size={15} color={c} /> },
  { tier: 'natural', title: 'Natural', detail: 'Clear and smooth, for long listening', icon: (c) => <Leaf size={15} color={c} /> },
  { tier: 'phone', title: 'On your phone', detail: 'Free, and they work offline', icon: (c) => <Smartphone size={15} color={c} /> },
];

interface VoiceListProps {
  languages: readonly Lang[];
  selectedIds: string[];
  onSelect: (voice: Voice) => void;
  /** The language tab to open on */
  initialLanguage?: Lang;
}

/**
 * Voices to choose from: a tab per language (when there's more than one),
 * grouped by level. Tap a card to choose it, or its play button to hear it.
 */
export function VoiceList({ languages, selectedIds, onSelect, initialLanguage }: VoiceListProps) {
  const t = useTokens();
  const { toast } = useToast();
  const { data } = useVoices();
  const preview = useAudioPlayer(null);
  const status = useAudioPlayerStatus(preview);
  const [lang, setLang] = useState<Lang>(initialLanguage && languages.includes(initialLanguage) ? initialLanguage : languages[0]);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const onDevice = useOnDeviceStore((s) => isOnDeviceActive(s) && s.speakers);

  // No pause on unmount: useAudioPlayer frees the player first, which already stops
  // it, and pausing a freed player throws ("shared object that was already released")

  const play = async (voice: Voice) => {
    haptics.tap();
    if (previewing === voice.id && status.playing) {
      preview.pause();
      return;
    }
    if (usePlayerStore.getState().isPlaying) audioEngine.pause();
    setLoading(voice.id);
    try {
      preview.replace({ uri: await previewUri(voice) });
      preview.play();
      setPreviewing(voice.id);
    } catch (e) {
      toast.show(isMissingPhoneVoice(e) ? missingPhoneVoiceToast : { variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setLoading(null);
    }
  };

  const voices = (data?.voices ?? []).filter((v) => v.language === lang);

  return (
    <View className="gap-4">
      {languages.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" accessibilityRole="tablist">
          {languages.map((l) => {
            const active = l === lang;
            return (
              <Pressable
                key={l}
                onPress={() => (haptics.tap(), setLang(l))}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={LANGUAGE_NAMES_EN[l]}
                className={`rounded-full px-4 py-2 active:opacity-70 ${active ? 'bg-accent' : 'bg-surface-secondary'}`}
              >
                <Text className={`text-[14px] font-semibold ${active ? 'text-accent-foreground' : 'text-foreground'}`}>{LANGUAGE_NAMES[l]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {TIERS.map(({ tier, title, detail: tierDetail, icon }) => {
        const group = voices.filter((v) => v.tier === tier);
        if (!group.length) return null;
        // Natural voices made on this phone cost nothing
        const detail = tier === 'natural' && onDevice && group.every((v) => onDevice[v.id]) ? 'Free and unlimited on this phone' : tierDetail;
        return (
          <View key={tier} className="gap-2">
            <View className="flex-row items-center gap-1.5 px-1">
              {icon(t.accent)}
              <Text variant="label">{title}</Text>
              <Text variant="caption" className="flex-1" numberOfLines={1}>· {detail}</Text>
            </View>
            {group.map((voice) => (
              <VoiceRow
                key={voice.id}
                voice={voice}
                selected={selectedIds.includes(voice.id)}
                speaking={previewing === voice.id && status.playing}
                loading={loading === voice.id}
                onSelect={() => (haptics.tap(), onSelect(voice))}
                onPlay={() => void play(voice)}
              />
            ))}
          </View>
        );
      })}

      {!data ? <Spinner color={t.accent} /> : null}
    </View>
  );
}

function VoiceRow({
  voice,
  selected,
  speaking,
  loading,
  onSelect,
  onPlay,
}: {
  voice: Voice;
  selected: boolean;
  speaking: boolean;
  loading: boolean;
  onSelect: () => void;
  onPlay: () => void;
}) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${voice.name}, ${voice.accent}, ${voice.style}`}
      className={`flex-row items-center gap-3.5 rounded-3xl border p-3 active:opacity-80 ${selected ? 'border-accent bg-accent-soft-bg' : 'border-transparent bg-surface'}`}
      style={selected ? undefined : { boxShadow: '0px 2px 10px rgba(80, 99, 184, 0.08)' }}
    >
      <VoiceAvatar name={voice.name} id={voice.id} size={48} phone={voice.tier === 'phone'} speaking={speaking} selected={selected} />
      <View className="flex-1 gap-0.5">
        <Text className="text-[16px] font-bold" numberOfLines={1}>{voice.name}</Text>
        <Text variant="caption" numberOfLines={1}>
          {voice.tier === 'phone' ? voice.style : `${voice.accent} · ${voice.style}`}
        </Text>
      </View>
      <Pressable
        onPress={onPlay}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={speaking ? `Stop ${voice.name}` : `Hear ${voice.name}`}
        className={`size-11 items-center justify-center rounded-full active:opacity-70 ${speaking ? 'bg-accent' : 'bg-accent-soft-bg'}`}
      >
        {loading ? (
          <Spinner size="sm" color={t.accent} />
        ) : speaking ? (
          <Pause size={17} color={t.accentForeground} fill={t.accentForeground} />
        ) : (
          <Play size={17} color={t.accent} fill={t.accent} style={{ marginLeft: 2 }} />
        )}
      </Pressable>
    </Pressable>
  );
}
