import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { AudioLines } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ChoiceChips, ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { documentsKey } from '@/features/library/hooks/use-documents';
import { useOwnVoice } from '@/features/own-voice/hooks';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { LANGS, LANGUAGE_NAMES, type Lang } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import { voiceTranslationApi } from '../api';

const AUDIO_FILES = ['audio/*'];

/**
 * Voice translation, step one: a recording of someone speaking, and the language to hear it
 * in. It's written down and translated on the server; the next screen follows it.
 */
export default function TranslateVoiceScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const client = useQueryClient();
  const ownVoice = useOwnVoice();
  const [to, setTo] = useState<Lang>('bn');
  const onPro = ownVoice.data ? ownVoice.data.blockedBy !== 'plan' : null;

  const start = useMutation({
    mutationFn: async () => {
      const res = await DocumentPicker.getDocumentAsync({ type: AUDIO_FILES, copyToCacheDirectory: true });
      const asset = res.assets?.[0];
      if (res.canceled || !asset) return null;
      return voiceTranslationApi.start({ uri: asset.uri, name: asset.name }, to);
    },
    onSuccess: (translation) => {
      if (!translation) return;
      haptics.success();
      void client.invalidateQueries({ queryKey: documentsKey });
      router.replace({ pathname: '/translation/[id]', params: { id: translation.documentId } });
    },
    onError: haptics.error,
  });

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 20 }}>
        <ScreenHeader title="Translate a recording" onBack={router.back} />
        <Text variant="lead">Someone speaking, in another language, in their own voice. The words are written down, translated, and read back by a copy of their voice.</Text>

        <GlassCard className="gap-3 p-4">
          <Need text="One person speaking, up to 10 minutes. MP3, M4A, WAV or OGG." />
          <Need text="The speaker says one short sentence into your phone to agree. Google checks it’s the same person before their voice is made." />
          <Need text="You can read and change the translation before you export it." />
        </GlassCard>

        <View className="gap-1">
          <Text variant="label" className="px-1 text-muted">Translate into</Text>
          <View className="-mx-3">
            <ChoiceChips options={[...LANGS]} value={to} format={(l) => LANGUAGE_NAMES[l]} onChange={setTo} />
          </View>
        </View>

        <InlineAlert message={start.error ? getErrorMessage(start.error) : null} />
        {onPro === false ? (
          <View className="gap-3">
            <Text className="text-[15px] leading-[23px] text-muted">Voice translation is part of {ownVoice.data?.plan ?? 'Pro'}.</Text>
            <PrimaryButton label="See plans" onPress={() => router.push('/plans')} />
          </View>
        ) : (
          <PrimaryButton label="Choose a recording" icon={<AudioLines size={18} color={t.accentForeground} />} isLoading={start.isPending} onPress={() => start.mutate()} />
        )}
        {start.isPending ? <Text variant="caption" className="text-center">Uploading. Keep this screen open until it’s sent.</Text> : null}
      </ScrollView>
    </CloudBackground>
  );
}

function Need({ text }: { text: string }) {
  return (
    <View className="flex-row gap-2.5">
      <View className="mt-[9px] size-1.5 rounded-full bg-accent" />
      <Text className="flex-1 text-[15px] leading-[22px]">{text}</Text>
    </View>
  );
}
