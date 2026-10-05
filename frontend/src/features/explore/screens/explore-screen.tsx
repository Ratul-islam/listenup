import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Spinner, useToast } from 'heroui-native';
import { Pause, Play } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import type { Voice } from '@/features/voices/api/voices.api';
import { VoiceAvatar } from '@/features/voices/components/voice-avatar';
import { useVoices } from '@/features/voices/hooks/use-voices';
import { isMissingPhoneVoice, missingPhoneVoiceToast, previewUri } from '@/features/voices/lib/voice-preview';
import { getErrorMessage } from '@/lib/api/api-error';
import { LANGS, LANGUAGE_NAMES } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { toast } = useToast();
  const { data } = useVoices();
  const preview = useAudioPlayer(null);
  const status = useAudioPlayerStatus(preview);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const hasPlayer = usePlayerStore((s) => !!s.documentId);

  const play = async (voice: Voice) => {
    if (current === voice.id && status.playing) return preview.pause();
    if (usePlayerStore.getState().isPlaying) audioEngine.pause();
    setLoading(voice.id);
    try {
      preview.replace({ uri: await previewUri(voice) });
      preview.play();
      setCurrent(voice.id);
    } catch (e) {
      toast.show(isMissingPhoneVoice(e) ? missingPhoneVoiceToast : { variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setLoading(null);
    }
  };

  return (
    <CloudBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + (hasPlayer ? 190 : 120), paddingHorizontal: 20, gap: 24 }}
      >
        <View className="gap-1">
          <Text variant="h1" accessibilityRole="header">Voices</Text>
          <Text variant="lead">Tap a voice to hear it. Phone voices are free and work offline; Expressive voices add emotions and use your Expressive minutes.</Text>
        </View>

        {LANGS.map((lang) => (
          <View key={lang} className="gap-2">
            <Text variant="label" className="px-1 text-muted">{LANGUAGE_NAMES[lang]}</Text>
            <GlassCard className="p-2">
              {(data?.voices ?? [])
                .filter((v) => v.language === lang)
                .map((voice) => {
                  const playing = current === voice.id && status.playing;
                  return (
                    <Pressable
                      key={voice.id}
                      onPress={() => void play(voice)}
                      accessibilityRole="button"
                      accessibilityLabel={playing ? `Stop ${voice.name}` : `Hear ${voice.name}`}
                      className="flex-row items-center gap-3 rounded-2xl p-2.5 active:bg-default"
                    >
                      <VoiceAvatar name={voice.name} size={40} />
                      <View className="flex-1">
                        <Text className="text-[16px] font-semibold">{voice.name}</Text>
                        <Text variant="caption" numberOfLines={1}>{voice.accent}, {voice.style.toLowerCase()}{voice.expressive ? ' · Expressive' : ''}</Text>
                      </View>
                      <View className="size-10 items-center justify-center rounded-full bg-accent-soft-bg">
                        {loading === voice.id ? (
                          <Spinner size="sm" color={t.accent} />
                        ) : playing ? (
                          <Pause size={15} color={t.accent} fill={t.accent} />
                        ) : (
                          <Play size={15} color={t.accent} fill={t.accent} style={{ marginLeft: 2 }} />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
            </GlassCard>
          </View>
        ))}
      </ScrollView>
    </CloudBackground>
  );
}
