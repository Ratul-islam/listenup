import { router, useLocalSearchParams } from 'expo-router';
import { useToast } from 'heroui-native';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { getErrorMessage } from '@/lib/api/api-error';
import { LANGS, LANGUAGE_NAMES_EN, type Lang } from '@/lib/languages';

import { useUpdatePreferences, useVoices } from '../hooks/use-voices';
import { VoiceList } from '../components/voice-list';

/** Your voice for each language: browse, hear and choose */
export default function VoicesScreen() {
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const { lang } = useLocalSearchParams<{ lang?: string }>();
  const { data } = useVoices();
  const update = useUpdatePreferences();
  const initial = LANGS.includes(lang as Lang) ? (lang as Lang) : undefined;

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 18 }}>
        <ScreenHeader title="Voices" onBack={router.back} />
        <Text variant="lead">Choose who reads each language. Tap ▶ to hear a voice first.</Text>
        <VoiceList
          languages={LANGS}
          initialLanguage={initial}
          selectedIds={data ? Object.values(data.preferences.voices) : []}
          onSelect={(voice) =>
            update.mutate(
              { voices: { [voice.language]: voice.id } },
              {
                onSuccess: () => toast.show({ label: `${voice.name} reads ${LANGUAGE_NAMES_EN[voice.language]} now` }),
                onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }),
              },
            )
          }
        />
      </ScrollView>
    </CloudBackground>
  );
}
