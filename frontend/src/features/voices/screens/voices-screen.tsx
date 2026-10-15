import { router, useLocalSearchParams } from 'expo-router';
import { useToast } from 'heroui-native';
import { Mic } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { offersOwnVoice, useOwnVoice } from '@/features/own-voice/hooks';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { getErrorMessage } from '@/lib/api/api-error';
import { LANGS, LANGUAGE_NAMES_EN, type Lang } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import { useUpdatePreferences, useVoices } from '../hooks/use-voices';
import { VoiceList } from '../components/voice-list';

/** Your voice for each language: browse, hear and choose. The language and level stay at the top; only the voices scroll. Each card says what its two taps do, so the page needs no instructions. */
export default function VoicesScreen() {
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const { lang } = useLocalSearchParams<{ lang?: string }>();
  const { data } = useVoices();
  const update = useUpdatePreferences();
  const t = useTokens();
  const ownVoice = useOwnVoice().data;
  const initial = LANGS.includes(lang as Lang) ? (lang as Lang) : undefined;

  return (
    <CloudBackground>
      <View className="flex-1 gap-4 px-5" style={{ paddingTop: insets.top + 6 }}>
        <ScreenHeader
          title="Voices"
          onBack={router.back}
          right={
            offersOwnVoice(ownVoice) ? (
              <Pressable
                onPress={() => router.push('/own-voice')}
                accessibilityRole="button"
                className="h-10 flex-row items-center gap-1.5 rounded-full bg-accent-soft-bg px-3.5 active:opacity-70"
              >
                <Mic size={16} color={t.accent} />
                <Text className="text-[14px] font-semibold text-accent-soft-fg">Your voice</Text>
              </Pressable>
            ) : null
          }
        />
        <VoiceList
          fill
          bottomInset={insets.bottom + 24}
          languages={LANGS}
          initialLanguage={initial}
          selectedIds={data ? Object.values(data.preferences.voices) : []}
          onSelect={(voice) =>
            update.mutate(
              { voices: { [voice.language]: voice.id } },
              {
                onSuccess: () => {
                  toast.show({ label: `${voice.name} reads ${LANGUAGE_NAMES_EN[voice.language]} now` });
                  // What's open in the player follows, so the choice is heard straight away
                  audioEngine.followPreferredVoice(voice);
                },
                onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }),
              },
            )
          }
        />
      </View>
    </CloudBackground>
  );
}
