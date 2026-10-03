import { router } from 'expo-router';
import { BookOpen, Camera, FileText, Globe, NotebookPen } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMark } from '@/components/ui/app-mark';
import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { IconTile } from '@/components/ui/icon-tile';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { Wordmark } from '@/components/ui/wordmark';
import { GoogleButton } from '@/features/auth/components/google-button';
import { useGoogleSignIn } from '@/features/auth/hooks/use-auth-mutations';
import { isGoogleSignInEnabled } from '@/features/auth/lib/google-sign-in';
import { VoiceAvatar } from '@/features/voices/components/voice-avatar';
import { featuredVoices } from '@/features/voices/voice-catalog';
import { getErrorMessage } from '@/lib/api/api-error';
import { useTokens } from '@/lib/use-tokens';

import { OnboardingHeader } from '../components/onboarding-header';
import { SamplePlayerCard } from '../components/sample-player-card';

const STEPS = 3;

function IntroStep({ width }: { width: number }) {
  const [speaking, setSpeaking] = useState(true);

  return (
    <ScrollView style={{ width }} contentContainerClassName="flex-grow justify-center gap-10 px-5 pb-6 pt-4" showsVerticalScrollIndicator={false}>
      <View className="items-center gap-5">
        <AppMark size={96} active={speaking} />
        <View className="items-center gap-2">
          <Wordmark />
          <Text variant="lead" className="max-w-[300px] text-center">
            Turn any article, PDF or note into natural speech, in English and বাংলা.
          </Text>
        </View>
      </View>
      <SamplePlayerCard onPlayingChange={setSpeaking} />
    </ScrollView>
  );
}

const SOURCES: { icon: typeof FileText; title: string; detail: string }[] = [
  { icon: FileText, title: 'PDFs and scans', detail: 'Including old Bijoy-font Bangla PDFs' },
  { icon: BookOpen, title: 'Word and ePub', detail: 'Reports, essays and whole books' },
  { icon: Globe, title: 'Web articles', detail: 'Paste a link to the article' },
  { icon: NotebookPen, title: 'Notes and pasted text', detail: 'Anything you can copy' },
  { icon: Camera, title: 'Photos of pages', detail: 'Take a picture, hear it read' },
];

function ImportStep({ width }: { width: number }) {
  const t = useTokens();
  return (
    <ScrollView style={{ width }} contentContainerClassName="gap-6 px-5 pb-6 pt-8" showsVerticalScrollIndicator={false}>
      <View className="gap-2">
        <Text variant="h1">Bring anything you want to hear</Text>
        <Text variant="lead">Add it once and it waits on your Soundshelf, ready to play.</Text>
      </View>
      <GlassCard className="gap-0.5 p-2">
        {SOURCES.map(({ icon: Icon, title, detail }) => (
          <View key={title} className="flex-row items-center gap-3.5 p-3">
            <IconTile size={44}>
              <Icon size={20} color={t.accent} />
            </IconTile>
            <View className="flex-1 gap-0.5">
              <Text className="text-[16px] font-semibold">{title}</Text>
              <Text variant="caption">{detail}</Text>
            </View>
          </View>
        ))}
      </GlassCard>
    </ScrollView>
  );
}

function VoicesStep({ width }: { width: number }) {
  const google = useGoogleSignIn();

  return (
    <ScrollView style={{ width }} contentContainerClassName="gap-6 px-5 pb-6 pt-8" showsVerticalScrollIndicator={false}>
      <View className="gap-2">
        <Text variant="h1">Hear it in a voice you like</Text>
        <Text variant="lead">English in several accents, and natural বাংলা.</Text>
      </View>

      <GlassCard className="gap-0.5 p-2">
        {featuredVoices.map((v) => (
          <View key={v.id} className="flex-row items-center gap-3 p-2.5">
            <VoiceAvatar name={v.name} size={40} />
            <View className="flex-1">
              <Text className="text-[16px] font-semibold">{v.name}</Text>
              <Text variant="caption" numberOfLines={1}>{v.accent}, {v.style.toLowerCase()}</Text>
            </View>
          </View>
        ))}
      </GlassCard>

      <View className="gap-3">
        <InlineAlert message={google.error ? getErrorMessage(google.error) : null} />
        {isGoogleSignInEnabled ? (
          <GoogleButton onPress={() => google.mutate()} isLoading={google.isPending} />
        ) : null}
        <PrimaryButton label="Sign up with email" onPress={() => router.push('/sign-up')} />
        <Pressable
          onPress={() => router.push('/sign-in')}
          accessibilityRole="button"
          className="h-12 items-center justify-center rounded-full active:opacity-70"
        >
          <Text variant="label" className="text-accent-soft-fg">I already have an account</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const list = useRef<FlatList<number>>(null);

  const goTo = useCallback((index: number) => {
    list.current?.scrollToIndex({ index, animated: true });
    setStep(index);
  }, []);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setStep(Math.round(e.nativeEvent.contentOffset.x / width));

  const renderStep = ({ item }: { item: number }) =>
    item === 0 ? <IntroStep width={width} /> : item === 1 ? <ImportStep width={width} /> : <VoicesStep width={width} />;

  return (
    <CloudBackground>
      <View className="flex-1" style={{ paddingTop: insets.top + 10 }}>
        <OnboardingHeader step={step} total={STEPS} onSkip={step < STEPS - 1 ? () => goTo(STEPS - 1) : undefined} />

        <FlatList
          ref={list}
          data={[0, 1, 2]}
          keyExtractor={String}
          renderItem={renderStep}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          className="flex-1"
        />

        {step < STEPS - 1 ? (
          <View className="px-5" style={{ paddingBottom: insets.bottom + 16 }}>
            <PrimaryButton label={step === 0 ? 'Get started' : 'Continue'} onPress={() => goTo(step + 1)} />
          </View>
        ) : (
          <View style={{ height: insets.bottom }} />
        )}
      </View>
    </CloudBackground>
  );
}
