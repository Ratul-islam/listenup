import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { useToast } from 'heroui-native';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import type { Voice } from '@/features/voices/api/voices.api';
import { VoiceAvatar } from '@/features/voices/components/voice-avatar';
import { useVoices } from '@/features/voices/hooks/use-voices';
import { isMissingPhoneVoice, missingPhoneVoiceToast, previewUri } from '@/features/voices/lib/voice-preview';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import type { Lang } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

/** "Meet the voices": a row of faces for these languages; tap one to hear it, or go to every voice */
export function VoicesRow({ languages }: { languages: Lang[] }) {
  const t = useTokens();
  const { toast } = useToast();
  const { data } = useVoices();
  const preview = useAudioPlayer(null);
  const status = useAudioPlayerStatus(preview);
  const [current, setCurrent] = useState<string | null>(null);
  const voices = (data?.voices ?? []).filter((v) => v.tier !== 'phone' && languages.includes(v.language));

  // No pause on unmount: the player is freed first, which already stops it
  const play = async (voice: Voice) => {
    haptics.tap();
    if (current === voice.id && status.playing) return preview.pause();
    if (usePlayerStore.getState().isPlaying) audioEngine.pause();
    setCurrent(voice.id);
    try {
      preview.replace({ uri: await previewUri(voice) });
      preview.play();
    } catch (e) {
      setCurrent(null);
      toast.show(isMissingPhoneVoice(e) ? missingPhoneVoiceToast : { variant: 'danger', label: getErrorMessage(e) });
    }
  };

  if (!voices.length) return null;
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text variant="label">Meet the voices</Text>
        <Pressable onPress={() => router.push('/voices')} accessibilityRole="button" hitSlop={8} className="flex-row items-center gap-0.5 active:opacity-70">
          <Text className="text-[14px] font-semibold text-accent">All voices</Text>
          <ChevronRight size={16} color={t.accent} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerClassName="gap-3 px-5">
        {voices.map((voice) => {
          const speaking = current === voice.id && status.playing;
          return (
            <Pressable
              key={voice.id}
              onPress={() => void play(voice)}
              accessibilityRole="button"
              accessibilityLabel={speaking ? `Stop ${voice.name}` : `Hear ${voice.name}, ${voice.style}`}
              className="w-16 items-center gap-1.5 active:opacity-70"
            >
              <VoiceAvatar name={voice.name} id={voice.id} size={56} speaking={speaking} />
              <Text className="text-[12px] font-medium" numberOfLines={1}>{voice.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
