import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Mic, Pause, Play, RotateCcw, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ChoiceChips, ScreenHeader, SettingsRow, SettingsSection } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { Tick } from '@/components/ui/tick';
import { formatResetDate } from '@/features/account/lib/allowance';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { voicesApi } from '@/features/voices/api/voices.api';
import { VoiceAvatar } from '@/features/voices/components/voice-avatar';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { isRtl, LANGUAGE_NAMES, type Lang } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import type { OwnVoiceState } from '../api/own-voice.api';
import { TakeRecorder, type Take } from '../components/take-recorder';
import { useOwnVoice, useRecordOwnVoice, useRemoveOwnVoice } from '../hooks';

/** The language the phone is set to, when there's a script in it */
function phoneLanguage(languages: Lang[]) {
  try {
    const language = Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0] as Lang;
    return languages.includes(language) ? language : null;
  } catch {
    return null;
  }
}

const WHY_NOT: Record<Exclude<OwnVoiceState['blockedBy'], 'plan' | null>, string> = {
  region: 'Making a voice from a recording isn’t available where you are.',
  setup: 'Making a voice from a recording isn’t available yet.',
  limit: 'You’ve used this month’s recordings. You can record again next month.',
  full: 'We can’t take new voices just now. Try again in a few days.',
};

/**
 * "Your voice" (Pro): read a short passage and a consent sentence aloud, and
 * ListenUp can read in your voice. One voice per account; it can be recorded
 * again or deleted here.
 */
export default function OwnVoiceScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { data } = useOwnVoice();
  const [recording, setRecording] = useState(false);

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Your voice" onBack={recording && data?.voice ? () => setRecording(false) : router.back} />
        {!data ? (
          <Spinner color={t.accent} />
        ) : recording || (data.status === 'none' && data.canRecord) ? (
          <RecordFlow state={data} onDone={() => setRecording(false)} />
        ) : data.voice ? (
          <SavedVoice state={data} onRecordAgain={() => setRecording(true)} />
        ) : (
          <Intro state={data} />
        )}
      </ScrollView>
    </CloudBackground>
  );
}

/** No voice yet, and none can be recorded now: what it is, and what's in the way */
function Intro({ state }: { state: OwnVoiceState }) {
  const t = useTokens();
  return (
    <GlassCard className="items-center gap-4 p-6">
      <View className="size-14 items-center justify-center rounded-full bg-accent-soft-bg">
        <Mic size={26} color={t.accent} />
      </View>
      <Text variant="h2" className="text-center">Hear it in your own voice</Text>
      <Text variant="lead" className="text-center">
        Read a short passage aloud once, and ListenUp can read your documents, and make your voiceovers, in your voice.
      </Text>
      {state.blockedBy === 'plan' ? (
        <PrimaryButton label={`See ${state.plan}`} onPress={() => router.push('/plans')} />
      ) : state.blockedBy ? (
        <Text variant="caption" className="text-center">{WHY_NOT[state.blockedBy]}</Text>
      ) : null}
    </GlassCard>
  );
}

/** The voice they've made: hear it, use it, record it again or delete it */
function SavedVoice({ state, onRecordAgain }: { state: OwnVoiceState; onRecordAgain: () => void }) {
  const t = useTokens();
  const { toast } = useToast();
  const remove = useRemoveOwnVoice();
  const sample = useAudioPlayer(null);
  const playing = useAudioPlayerStatus(sample).playing;
  const [loading, setLoading] = useState(false);
  const voice = state.voice!;
  const locked = state.status === 'locked';
  const language = voice.language ?? 'en';

  const hear = async () => {
    if (playing) return sample.pause();
    if (usePlayerStore.getState().isPlaying) audioEngine.pause();
    setLoading(true);
    try {
      sample.replace({ uri: await voicesApi.preview(`mine-${language}`) });
      sample.play();
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete your voice?',
      'This erases the voice, your two recordings, and the audio we keep in it. Documents that used it go back to your usual voice. MP3s you’ve already saved stay on your phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(undefined, {
              onSuccess: () => toast.show({ label: 'Your voice is deleted' }),
              onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }),
            }),
        },
      ],
    );

  return (
    <>
      <GlassCard className="gap-4 p-5">
        <View className="flex-row items-center gap-3.5">
          <VoiceAvatar name={voice.name} id="mine" size={52} speaking={playing} />
          <View className="flex-1 gap-0.5">
            <Text variant="title" numberOfLines={1}>{voice.name}</Text>
            <Text variant="caption">
              {voice.recordedAt ? `Recorded ${formatResetDate(voice.recordedAt.slice(0, 10))}` : 'Your voice'}
            </Text>
          </View>
          {locked ? null : (
            <Pressable
              onPress={() => void hear()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Stop' : 'Hear your voice'}
              className={`size-11 items-center justify-center rounded-full active:opacity-70 ${playing ? 'bg-accent' : 'bg-accent-soft-bg'}`}
            >
              {loading ? (
                <Spinner size="sm" color={t.accent} />
              ) : playing ? (
                <Pause size={17} color={t.accentForeground} fill={t.accentForeground} />
              ) : (
                <Play size={17} color={t.accent} fill={t.accent} style={{ marginLeft: 2 }} />
              )}
            </Pressable>
          )}
        </View>
        {locked ? (
          <>
            <Text variant="lead">Your voice is saved, but it’s part of {state.plan}. It reads again as soon as you’re back on {state.plan}.</Text>
            <PrimaryButton label={`See ${state.plan}`} onPress={() => router.push('/plans')} />
          </>
        ) : (
          <>
            <Text variant="lead">
              Choose it like any voice: it’s first under Expressive in every language. It uses your Expressive minutes and takes emotions. Only you can use it.
            </Text>
            <PrimaryButton label="Choose where it reads" onPress={() => router.push({ pathname: '/voices', params: { lang: language } })} />
          </>
        )}
      </GlassCard>

      <SettingsSection footer={state.blockedBy && state.blockedBy !== 'plan' ? WHY_NOT[state.blockedBy] : undefined}>
        {state.canRecord ? (
          <SettingsRow
            icon={<RotateCcw size={19} color={t.foreground} />}
            label="Record it again"
            detail={`Replaces this voice. Audio made with it is made again when you play it. ${state.attemptsLeft} left this month`}
            onPress={onRecordAgain}
          />
        ) : null}
        <SettingsRow
          icon={remove.isPending ? <Spinner size="sm" color={t.danger} /> : <Trash2 size={19} color={t.danger} />}
          label="Delete my voice"
          destructive
          onPress={remove.isPending ? undefined : confirmDelete}
        />
      </SettingsSection>
    </>
  );
}


/** Three steps: what's needed, the reading, the consent sentence. Then the voice is made. */
function RecordFlow({ state, onDone }: { state: OwnVoiceState; onDone: () => void }) {
  const { toast } = useToast();
  const record = useRecordOwnVoice();
  const languages = state.scripts.map((s) => s.language);
  const [language, setLanguage] = useState<Lang>(() => phoneLanguage(languages) ?? languages[0]);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [mine, setMine] = useState(false);
  const [adult, setAdult] = useState(false);
  const [outside, setOutside] = useState(false);
  const [reading, setReading] = useState<Take | null>(null);
  const [consent, setConsent] = useState<Take | null>(null);
  const [error, setError] = useState<string | null>(null);
  const script = state.scripts.find((s) => s.language === language) ?? state.scripts[0];
  const agreed = mine && adult && (!state.askState || outside);
  const scriptStyle = { writingDirection: isRtl(language) ? ('rtl' as const) : ('ltr' as const) };

  const make = async () => {
    if (!reading || !consent) return;
    setError(null);
    try {
      const [source, sentence] = await Promise.all([new File(reading.uri).base64(), new File(consent.uri).base64()]);
      await record.mutateAsync({
        language,
        source,
        consent: sentence,
        confirm: { ownVoice: true, adult: true, ...(state.askState && { notInRestrictedState: outside }) },
      });
      haptics.success();
      toast.show({ label: 'Your voice is ready', description: 'Choose it on the Voices page, under Expressive.' });
      onDone();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  if (step === 0) {
    return (
      <>
        <Text variant="lead">
          You’ll read two short things aloud: a passage, then a sentence saying the voice is yours. It takes about a minute. Find a quiet room and hold the phone
          as you would on a call.
        </Text>
        <SettingsSection title="Read in">
          <ChoiceChips
            options={languages}
            value={language}
            format={(l) => LANGUAGE_NAMES[l]}
            onChange={(l) => {
              setLanguage(l);
              setReading(null);
              setConsent(null);
            }}
          />
        </SettingsSection>
        <View className="gap-1.5">
          <Tick checked={mine} onChange={setMine} label="This is my own voice. I won’t record anyone else." />
          <Tick checked={adult} onChange={setAdult} label="I’m 18 or older." />
          {state.askState ? <Tick checked={outside} onChange={setOutside} label="I’m not in Illinois or Texas, where this isn’t available." /> : null}
        </View>
        <Text variant="caption">
          Your recordings go to Google, which makes the voice and checks that it’s you giving consent. We keep them so the voice can be renewed. Only your account
          can use the voice, and deleting it erases the recordings too.
        </Text>
        <PrimaryButton label="Start" isDisabled={!agreed} onPress={() => setStep(1)} />
      </>
    );
  }

  const consentStep = step === 2;
  const take = consentStep ? consent : reading;
  return (
    <>
      <View className="gap-1">
        <Text variant="label" className="text-muted">Step {step} of 2</Text>
        <Text variant="h2">{consentStep ? 'Now say this sentence' : 'Read this aloud'}</Text>
        <Text variant="lead">
          {consentStep
            ? 'Word for word, in the same room and at the same distance. Google checks it against your reading.'
            : 'At your normal reading pace, the way you’d read to a friend.'}
        </Text>
      </View>
      <GlassCard className="p-5">
        <Text className="text-[19px] leading-[31px]" style={scriptStyle}>{consentStep ? script.consent : script.reading}</Text>
      </GlassCard>
      {record.isPending ? (
        <View className="items-center gap-3 py-2">
          <Spinner />
          <Text variant="caption" className="text-center">Making your voice. This can take a minute; keep this screen open.</Text>
        </View>
      ) : (
        <>
          <TakeRecorder
            // A fresh recorder for each step
            key={step}
            take={take}
            onTake={consentStep ? setConsent : setReading}
            minSec={consentStep ? state.consentSec.min : state.readingSec.min}
            maxSec={consentStep ? state.consentSec.max : state.readingSec.max}
          />
          <InlineAlert message={error} />
          <View className="gap-2.5">
            {consentStep ? (
              <PrimaryButton label="Make my voice" isDisabled={!take} onPress={() => void make()} />
            ) : (
              <PrimaryButton label="Next" isDisabled={!take} onPress={() => setStep(2)} />
            )}
            <PrimaryButton
              label="Back"
              variant="secondary"
              onPress={() => {
                setError(null);
                setStep(consentStep ? 1 : 0);
              }}
            />
          </View>
        </>
      )}
    </>
  );
}
