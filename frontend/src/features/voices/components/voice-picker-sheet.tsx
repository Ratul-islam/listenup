import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Spinner, useToast } from 'heroui-native';
import { Check, Pause, Play } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { getErrorMessage } from '@/lib/api/api-error';
import { useTokens } from '@/lib/use-tokens';

import { voicesApi, type Voice } from '../api/voices.api';
import { useVoices } from '../hooks/use-voices';
import { VoiceAvatar } from './voice-avatar';

interface VoicePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Languages to offer; both when omitted */
  languages?: ('en' | 'bn')[];
  selectedIds: string[];
  onSelect: (voice: Voice) => void;
  title?: string;
}

/** Voice list with tap-to-preview, grouped by language */
export function VoicePickerSheet({ visible, onClose, languages = ['en', 'bn'], selectedIds, onSelect, title = 'Choose a voice' }: VoicePickerSheetProps) {
  const t = useTokens();
  const { toast } = useToast();
  const { data } = useVoices();
  const preview = useAudioPlayer(null);
  const status = useAudioPlayerStatus(preview);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const play = async (voice: Voice) => {
    if (previewing === voice.id && status.playing) {
      preview.pause();
      return;
    }
    if (usePlayerStore.getState().isPlaying) audioEngine.pause();
    setLoading(voice.id);
    try {
      const url = await voicesApi.preview(voice.id);
      preview.replace({ uri: url });
      preview.play();
      setPreviewing(voice.id);
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setLoading(null);
    }
  };

  const close = () => {
    preview.pause();
    onClose();
  };

  return (
    <ActionSheet visible={visible} onClose={close} title={title}>
      <ScrollView style={{ maxHeight: 460 }} contentContainerClassName="gap-4 pb-2">
        {languages.map((lang) => (
          <View key={lang} className="gap-1">
            <Text variant="label" className="px-1 text-muted">{lang === 'bn' ? 'বাংলা' : 'English'}</Text>
            {(data?.voices ?? [])
              .filter((v) => v.language === lang)
              .map((voice) => {
                const selected = selectedIds.includes(voice.id);
                const isPreviewing = previewing === voice.id && status.playing;
                return (
                  <Pressable
                    key={voice.id}
                    onPress={() => onSelect(voice)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    className={`flex-row items-center gap-3 rounded-2xl p-2.5 active:bg-default ${selected ? 'bg-accent-soft-bg' : ''}`}
                  >
                    <VoiceAvatar name={voice.name} size={40} />
                    <View className="flex-1">
                      <Text className="text-[16px] font-semibold">{voice.name}</Text>
                      <Text variant="caption" numberOfLines={1}>
                        {voice.accent}, {voice.style.toLowerCase()}{voice.expressive ? '' : '. No emotions'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => void play(voice)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={isPreviewing ? `Stop ${voice.name} preview` : `Preview ${voice.name}`}
                      className="size-10 items-center justify-center rounded-full bg-accent-soft-bg active:opacity-70"
                    >
                      {loading === voice.id ? (
                        <Spinner size="sm" color={t.accent} />
                      ) : isPreviewing ? (
                        <Pause size={16} color={t.accent} fill={t.accent} />
                      ) : (
                        <Play size={16} color={t.accent} fill={t.accent} style={{ marginLeft: 2 }} />
                      )}
                    </Pressable>
                    {selected ? <Check size={20} color={t.accent} /> : <View className="w-5" />}
                  </Pressable>
                );
              })}
          </View>
        ))}
      </ScrollView>
    </ActionSheet>
  );
}
