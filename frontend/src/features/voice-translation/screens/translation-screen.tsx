import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { ChevronDown, ChevronUp, CircleCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { Tick } from '@/components/ui/tick';
import { documentsApi } from '@/features/library/api/documents.api';
import { documentsKey } from '@/features/library/hooks/use-documents';
import { TakeRecorder, type Take } from '@/features/own-voice/components/take-recorder';
import { voicesKey } from '@/features/voices/hooks/use-voices';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { isRtl, LANGUAGE_NAMES } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import { voiceTranslationApi, type VoiceTranslation } from '../api';

const translationKey = (id: string) => ['voice-translation', id] as const;

/**
 * A voice translation: while it's being heard, then what was said, the translation as a script,
 * and the speaker's consent, after which the translation is read in their voice.
 */
export default function TranslationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const doc = useQuery({ queryKey: ['document', id], queryFn: () => documentsApi.get(id) });
  const state = useQuery({
    queryKey: translationKey(id),
    queryFn: () => voiceTranslationApi.get(id),
    // Until it's been heard, and then until its script is split into parts
    refetchInterval: (q) => (q.state.data?.status === 'listening' ? 3000 : false),
  });
  const tr = state.data;
  const ready = tr?.status === 'ready' && doc.data?.status === 'READY';

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 18 }}>
        <ScreenHeader title={doc.data?.title ?? 'Translation'} onBack={router.back} />
        {!tr ? (
          <Spinner color={t.accent} className="my-8 self-center" />
        ) : tr.status === 'listening' || (tr.status === 'ready' && doc.data?.status !== 'READY' && doc.data?.status !== 'FAILED') ? (
          <View className="items-center gap-3 py-10">
            <Spinner color={t.accent} />
            <Text className="text-center text-[16px] font-semibold">{tr.status === 'listening' ? 'Writing it down and translating…' : 'Splitting the translation into parts…'}</Text>
            <Text variant="caption" className="text-center">About a minute for every few minutes of speech. You can leave this screen; it carries on.</Text>
          </View>
        ) : tr.status === 'failed' || doc.data?.status === 'FAILED' ? (
          <View className="gap-4">
            <InlineAlert message={tr.error ?? doc.data?.error ?? 'We couldn’t translate this recording.'} />
            <PrimaryButton label="Try another recording" onPress={() => router.replace('/translate-voice')} />
          </View>
        ) : (
          <>
            <GlassCard className="gap-3 p-4">
              <Text className="text-[15px] text-muted">
                {tr.from ? `${LANGUAGE_NAMES[tr.from]} → ${LANGUAGE_NAMES[tr.to]}` : `Into ${LANGUAGE_NAMES[tr.to]}`}
                {tr.durationSec ? ` · ${Math.max(1, Math.round(tr.durationSec / 60))} min recording` : ''}
              </Text>
              <Text className="text-[16px] leading-[24px]">The translation is a script: read it, change any line, play it and export it as an MP3.</Text>
              {ready ? <PrimaryButton label="Open the script" onPress={() => router.push({ pathname: '/script/[id]', params: { id } })} /> : null}
            </GlassCard>

            <Transcript tr={tr} />
            <Speaker tr={tr} documentId={id} />
          </>
        )}
      </ScrollView>
    </CloudBackground>
  );
}

/** What was said, in its own language, folded away until it's wanted */
function Transcript({ tr }: { tr: VoiceTranslation }) {
  const t = useTokens();
  const [open, setOpen] = useState(false);
  if (!tr.transcript) return null;
  return (
    <GlassCard className="gap-2 p-4">
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} className="flex-row items-center justify-between">
        <Text className="text-[16px] font-semibold">What was said{tr.from ? ` (${LANGUAGE_NAMES[tr.from]})` : ''}</Text>
        {open ? <ChevronUp size={18} color={t.muted} /> : <ChevronDown size={18} color={t.muted} />}
      </Pressable>
      <Text className="text-[15px] leading-[23px] text-muted" numberOfLines={open ? undefined : 3} style={tr.from && isRtl(tr.from) ? { writingDirection: 'rtl', textAlign: 'right' } : undefined}>
        {tr.transcript}
      </Text>
    </GlassCard>
  );
}

/** The speaker's voice: made once they say Google's consent sentence, then it reads the translation */
function Speaker({ tr, documentId }: { tr: VoiceTranslation; documentId: string }) {
  const t = useTokens();
  const { toast } = useToast();
  const client = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const [outside, setOutside] = useState(false);
  const [take, setTake] = useState<Take | null>(null);
  const make = useMutation({
    mutationFn: async () =>
      voiceTranslationApi.consent(documentId, {
        consent: await new File(take!.uri).base64(),
        language: tr.consent.language,
        confirm: { speakerAgreed: true, notInRestrictedState: outside },
      }),
    onSuccess: (next) => {
      haptics.success();
      client.setQueryData(translationKey(documentId), next);
      void client.invalidateQueries({ queryKey: voicesKey });
      void client.invalidateQueries({ queryKey: ['script', documentId] });
      void client.invalidateQueries({ queryKey: ['document', documentId] });
      void client.invalidateQueries({ queryKey: documentsKey });
      toast.show({ variant: 'success', label: 'The speaker’s voice is ready', description: 'The translation is read in it now.' });
    },
    onError: haptics.error,
  });

  if (tr.speaker.status === 'ready') {
    return (
      <GlassCard className="flex-row items-center gap-3 p-4">
        <CircleCheck size={20} color={t.accent} />
        <Text className="flex-1 text-[15px] leading-[22px]">Read in the speaker’s own voice. Open the script to hear it or change any line.</Text>
      </GlassCard>
    );
  }
  if (tr.speaker.status === 'unavailable') {
    return (
      <GlassCard className="p-4">
        <Text className="text-[15px] leading-[22px]">There isn’t enough clear speech in the recording to copy the speaker’s voice. Pick a voice in the script instead.</Text>
      </GlassCard>
    );
  }
  if (!tr.canClone) {
    return (
      <GlassCard className="gap-3 p-4">
        <Text className="text-[15px] leading-[22px]">
          {tr.blockedBy === 'plan'
            ? 'Hearing it in the speaker’s own voice is part of Pro. The script is read in one of ListenUp’s voices meanwhile.'
            : 'Copying a speaker’s voice isn’t available where you are. The script is read in one of ListenUp’s voices.'}
        </Text>
        {tr.blockedBy === 'plan' ? <PrimaryButton label="See plans" variant="secondary" onPress={() => router.push('/plans')} /> : null}
      </GlassCard>
    );
  }

  const ticked = agreed && (!tr.askState || outside);
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text variant="h2">Hear it in the speaker’s voice</Text>
        <Text variant="lead">Hand the phone to the person in the recording. They read this sentence aloud, word for word, in a quiet room.</Text>
      </View>
      <View className="gap-1.5">
        <Tick checked={agreed} onChange={setAgreed} label="The speaker agrees to a copy of their voice reading this translation." />
        {tr.askState ? <Tick checked={outside} onChange={setOutside} label="The speaker isn’t in Illinois or Texas, where this isn’t available." /> : null}
      </View>
      {ticked ? (
        <>
          <GlassCard className="p-5">
            <Text className="text-[19px] leading-[31px]" style={isRtl(tr.consent.language) ? { writingDirection: 'rtl', textAlign: 'right' } : undefined}>
              {tr.consent.sentence}
            </Text>
          </GlassCard>
          {make.isPending ? (
            <View className="items-center gap-3 py-2">
              <Spinner />
              <Text variant="caption" className="text-center">Making the speaker’s voice. This can take a minute; keep this screen open.</Text>
            </View>
          ) : (
            <>
              <TakeRecorder take={take} onTake={setTake} minSec={tr.consent.sec.min} maxSec={tr.consent.sec.max} labels={{ idle: 'Tap, then the speaker reads the sentence' }} />
              <InlineAlert message={make.error ? getErrorMessage(make.error) : null} />
              <PrimaryButton label="Make the speaker’s voice" isDisabled={!take} onPress={() => make.mutate()} />
            </>
          )}
        </>
      ) : null}
      <Text variant="caption">
        The sentence and 25 seconds of the recording go to Google, which makes the voice and checks it’s the same person. They’re kept privately with this script, so the voice can be renewed each week, and are erased when you delete it.
      </Text>
    </View>
  );
}
