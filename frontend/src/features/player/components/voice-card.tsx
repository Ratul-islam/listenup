import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { VoicePickerSheet } from '@/features/voices/components/voice-picker-sheet';
import { useVoice } from '@/features/voices/hooks/use-voices';
import { LANGS } from '@/lib/languages';

import { audioEngine } from '../engine/audio-engine';
import { usePlayerStore } from '../store/player.store';

/** "Read by Nova", with a quiet way to switch voices */
export function VoiceCard() {
  const [open, setOpen] = useState(false);
  const chunkLanguage = usePlayerStore((s) => s.chunks[s.chunkIndex]?.language ?? 'en');
  const voices = usePlayerStore((s) => s.voices);
  const chunks = usePlayerStore((s) => s.chunks);
  const voice = useVoice(voices[chunkLanguage]);
  // Voices for the languages this document actually contains
  const languages = useMemo(() => LANGS.filter((lang) => chunks.some((c) => c.language === lang)), [chunks]);

  return (
    <View className="flex-row items-center justify-center gap-1">
      <Text variant="caption" className="text-[14px]">Read by</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Voice: ${voice?.name ?? 'loading'}. Change voice`}
        className="flex-row items-center gap-1 rounded-full px-2 py-1.5 active:bg-default"
      >
        <Text className="text-[14px] font-semibold">{voice?.name ?? '…'}</Text>
        <Text className="text-[14px] font-medium text-accent">Change</Text>
      </Pressable>

      <VoicePickerSheet
        visible={open}
        onClose={() => setOpen(false)}
        languages={languages}
        selectedIds={Object.values(voices)}
        onSelect={(v) => {
          setOpen(false);
          void audioEngine.setVoice(v.id);
        }}
      />
    </View>
  );
}
