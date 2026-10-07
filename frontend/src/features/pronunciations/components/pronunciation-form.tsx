import { useAudioPlayer } from 'expo-audio';
import { useToast } from 'heroui-native';
import { Volume2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { isMissingPhoneVoice, missingPhoneVoiceToast } from '@/features/voices/lib/voice-preview';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import type { Lang } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';
import { phoneVoice } from '@/modules/phone-voice';

import { pronunciationsApi, type Pronunciation } from '../api/pronunciations.api';
import { useRemovePronunciation, useSavePronunciation } from '../hooks';

interface PronunciationFormProps {
  /** Editing this one; otherwise a new word, maybe picked from a script */
  existing?: Pronunciation | null;
  word?: string;
  /** The language the word is read in, so "Hear it" uses that voice */
  language?: Lang;
  voiceId?: string;
  onDone: () => void;
}

const fieldClass = 'rounded-2xl border border-field-border bg-field px-4 py-3.5 font-sans text-[16px] text-foreground';

/**
 * Teach the voices one word: as it's written, and spelled the way it should
 * sound. "Hear it" plays the spelling in the voice that reads that language.
 */
export function PronunciationForm({ existing, word: initialWord, language, voiceId, onDone }: PronunciationFormProps) {
  const t = useTokens();
  const { toast } = useToast();
  const [word, setWord] = useState(existing?.word ?? initialWord ?? '');
  const [sayAs, setSayAs] = useState(existing?.sayAs ?? '');
  const [hearing, setHearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useAudioPlayer(null);
  const save = useSavePronunciation();
  const remove = useRemovePronunciation();
  const ready = word.trim().length > 0 && sayAs.trim().length > 0;

  const hear = async () => {
    if (!sayAs.trim()) return;
    setHearing(true);
    setError(null);
    if (usePlayerStore.getState().isPlaying) audioEngine.pause();
    try {
      let uri: string;
      try {
        uri = (await pronunciationsApi.preview({ sayAs: sayAs.trim(), language, voiceId })).url;
      } catch (e) {
        // Phone voices (and no minutes left) say it on the device instead
        if (!hasErrorCode(e, 'PHONE_VOICE', 'USAGE_LIMIT_REACHED', 'BUDGET_PAUSED')) throw e;
        uri = (await phoneVoice.synthesize(sayAs.trim(), language ?? 'en')).uri;
      }
      preview.replace({ uri });
      preview.play();
    } catch (e) {
      if (isMissingPhoneVoice(e)) toast.show(missingPhoneVoiceToast);
      else setError(getErrorMessage(e));
    } finally {
      setHearing(false);
    }
  };

  const submit = () =>
    save.mutate(
      { id: existing?.id, word: word.trim(), sayAs: sayAs.trim() },
      {
        onSuccess: (saved) => {
          haptics.success();
          toast.show({ variant: 'success', label: `“${saved.word}” saved`, description: 'Parts with this word are voiced again the next time they play.' });
          onDone();
        },
        onError: (e) => setError(getErrorMessage(e)),
      },
    );

  return (
    <View className="gap-3.5">
      <View className="gap-1.5">
        <Text variant="label" className="px-1 text-muted">Word, as it’s written</Text>
        <TextInput
          value={word}
          onChangeText={setWord}
          placeholder="Ratul"
          placeholderTextColor={t.muted}
          maxLength={60}
          autoCorrect={false}
          autoFocus={!initialWord && !existing}
          accessibilityLabel="Word as it is written"
          className={fieldClass}
        />
      </View>
      <View className="gap-1.5">
        <Text variant="label" className="px-1 text-muted">Say it like</Text>
        <View className="flex-row items-center gap-2">
          <TextInput
            value={sayAs}
            onChangeText={setSayAs}
            placeholder="Rah-tool"
            placeholderTextColor={t.muted}
            maxLength={120}
            autoCorrect={false}
            autoFocus={!!initialWord && !existing}
            accessibilityLabel="Spelled the way it sounds"
            className={`${fieldClass} flex-1`}
          />
          <Pressable
            onPress={() => void hear()}
            disabled={!sayAs.trim() || hearing}
            accessibilityRole="button"
            accessibilityLabel="Hear it"
            className={`h-[52px] flex-row items-center gap-1.5 rounded-2xl bg-accent-soft-bg px-3.5 active:opacity-80 ${!sayAs.trim() ? 'opacity-50' : ''}`}
          >
            <Volume2 size={18} color={t.accent} />
            <Text className="text-[14px] font-semibold text-accent-soft-fg">{hearing ? '…' : 'Hear it'}</Text>
          </Pressable>
        </View>
        <Text variant="caption" className="px-1">Spell it the way it sounds. Hyphens help: “Rah-tool”, “jif”, “Dhaa-ka”.</Text>
      </View>
      <InlineAlert message={error} />
      <PrimaryButton label="Save" isLoading={save.isPending} isDisabled={!ready} onPress={submit} />
      {existing ? (
        <Pressable
          onPress={() => remove.mutate(existing.id, { onSuccess: onDone, onError: (e) => setError(getErrorMessage(e)) })}
          disabled={remove.isPending}
          accessibilityRole="button"
          className="self-center rounded-full px-3 py-1.5 active:bg-default"
        >
          <Text className="text-[14px] font-medium text-danger">Remove this word</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
