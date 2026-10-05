import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Avatar, Switch, useToast } from 'heroui-native';
import { ChevronRight, FileText, Gift, Languages, Podcast, Shield, ShieldCheck, Star } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ChoiceChips, SettingsRow, SettingsSection } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { formatResetDate, formatTimeLeft } from '@/features/account/lib/allowance';
import { RewardAdRow } from '@/features/ads/components/reward-ad-row';
import { showAdPrivacyOptions, useAdsSdk } from '@/features/ads/lib/ads-sdk';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useListeningStats } from '@/features/library/hooks/use-documents';
import { offlineFiles, useOfflineStore } from '@/features/offline/offline-files';
import { megabytes } from '@/features/offline/offline-panel';
import { usePlayerStore } from '@/features/player/store/player.store';
import { VoiceAvatar } from '@/features/voices/components/voice-avatar';
import { useUpdatePreferences, useUsage, useVoices } from '@/features/voices/hooks/use-voices';
import { initials } from '@/features/voices/voice-catalog';
import { getErrorMessage } from '@/lib/api/api-error';
import { LANGUAGE_NAMES, LANGUAGE_NAMES_EN, LANGS, type Lang } from '@/lib/languages';
import { useThemePreference, type ThemePreference } from '@/lib/theme';
import { useTokens } from '@/lib/use-tokens';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const GOALS = [15, 30, 45, 60];
const THEMES: ThemePreference[] = ['system', 'light', 'dark'];
const THEME_LABELS: Record<ThemePreference, string> = { system: 'Match phone', light: 'Light', dark: 'Dark' };
const PACKAGE = Constants.expoConfig?.android?.package ?? 'dev.ratul.tts';
// Language tiles shown before "All languages"
const FIRST_LANGUAGES = 5;

/** Opens the app's Play Store listing (the Play app if installed, otherwise the web page) */
async function openStoreListing() {
  try {
    await Linking.openURL(`market://details?id=${PACKAGE}`);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${PACKAGE}`);
  }
}

export default function StudioScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const hasPlayer = usePlayerStore((s) => !!s.documentId);
  const { data } = useVoices();
  const usage = useUsage();
  const stats = useListeningStats();
  const update = useUpdatePreferences();
  const [theme, setTheme] = useThemePreference();
  const adPrivacy = useAdsSdk((s) => s.privacyOptionsRequired);
  const prefs = data?.preferences;

  const save = (body: Parameters<typeof update.mutate>[0]) =>
    update.mutate(body, { onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }) });

  // One tile per language: who reads it; opens the Voices page on that language
  const voiceTile = (lang: Lang) => {
    const voice = data?.voices.find((v) => v.id === prefs?.voices[lang]);
    return (
      <Pressable
        key={lang}
        onPress={() => router.push({ pathname: '/voices', params: { lang } })}
        accessibilityRole="button"
        accessibilityLabel={`${LANGUAGE_NAMES_EN[lang]}: ${voice?.name ?? 'loading'}. Change voice`}
        className="flex-1 gap-3 rounded-3xl bg-surface p-3.5 active:opacity-80"
        style={{ boxShadow: '0px 2px 12px rgba(80, 99, 184, 0.08)' }}
      >
        <View className="flex-row items-center justify-between">
          <VoiceAvatar name={voice?.name ?? '?'} id={voice?.id} size={40} phone={voice?.tier === 'phone'} />
          <ChevronRight size={16} color={t.muted} />
        </View>
        <View>
          <Text className="text-[16px] font-bold" numberOfLines={1}>{voice?.name ?? '…'}</Text>
          <Text variant="caption" numberOfLines={1}>
            {LANGUAGE_NAMES[lang]}
            {lang !== 'en' ? ` · ${LANGUAGE_NAMES_EN[lang]}` : ''}
          </Text>
        </View>
      </Pressable>
    );
  };
  const tiles = [...LANGS.slice(0, FIRST_LANGUAGES).map(voiceTile), <AllLanguagesTile key="all" count={LANGS.length} />];

  const downloads = Object.values(useOfflineStore((s) => s.downloads));
  const downloadsSize = downloads.reduce((n, d) => n + d.sizeBytes, 0);
  const removeDownloads = () =>
    Alert.alert('Remove all downloads?', 'They’ll stream again next time you play them.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => offlineFiles.removeAll() },
    ]);
  const natural = usage.data?.natural;
  const expressive = usage.data?.expressive;
  const todayMin = Math.floor((stats.data?.todaySec ?? 0) / 60);
  const streak = stats.data?.streakDays ?? 0;

  return (
    <CloudBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + (hasPlayer ? 190 : 120), paddingHorizontal: 20, gap: 22 }}
      >
        <Text variant="h1" accessibilityRole="header">Studio</Text>

        <GlassCard raised onPress={() => router.push('/profile')} accessibilityLabel="Profile" className="flex-row items-center gap-3.5 p-4">
          <Avatar size="md" alt={user?.name ?? user?.email ?? 'Account'}>
            {user?.avatarUrl ? <Avatar.Image source={{ uri: user.avatarUrl }} /> : null}
            <Avatar.Fallback>{initials(user?.name ?? user?.email ?? '?')}</Avatar.Fallback>
          </Avatar>
          <View className="flex-1">
            <Text className="text-[17px] font-semibold" numberOfLines={1}>{user?.name ?? 'Your account'}</Text>
            <Text variant="caption" numberOfLines={1}>{user?.email}</Text>
          </View>
          <ChevronRight size={18} color={t.muted} />
        </GlassCard>

        <SettingsSection title="Your listening">
          <View className="gap-3 p-3">
            <View className="flex-row items-baseline justify-between">
              <Text className="text-[16px] font-semibold">{todayMin} of {prefs?.dailyGoalMinutes ?? 30} minutes today</Text>
              {streak > 1 ? <Text variant="caption">{streak} days in a row</Text> : null}
            </View>
            <ProgressBar value={stats.data?.goalFraction ?? 0} />
          </View>
        </SettingsSection>

        <SettingsSection title="Plan">
          <View className="gap-3 p-3">
            <View className="flex-row items-baseline justify-between">
              <Text className="text-[16px] font-semibold">{usage.data?.plan.name ?? 'Free'} plan</Text>
              {usage.data?.plan.expiresAt ? (
                <Text variant="caption">
                  {usage.data.plan.renews ? 'Renews' : 'Ends'} {formatResetDate(usage.data.plan.expiresAt.slice(0, 10))}
                </Text>
              ) : null}
            </View>
            <View className="gap-1.5">
              <View className="flex-row items-baseline justify-between">
                <Text className="text-[15px]">Natural voices</Text>
                <Text variant="caption">{natural ? `${formatTimeLeft(natural.remainingSec)} left` : '…'}</Text>
              </View>
              <ProgressBar value={natural ? natural.usedSec / Math.max(natural.limitSec, 1) : 0} />
            </View>
            <View className="gap-1.5">
              <View className="flex-row items-baseline justify-between">
                <Text className="text-[15px]">{expressive?.trial ? 'Expressive voices (free trial)' : 'Expressive voices'}</Text>
                <Text variant="caption">{expressive ? `${formatTimeLeft(expressive.remainingSec)} left` : '…'}</Text>
              </View>
              <ProgressBar value={expressive ? expressive.usedSec / Math.max(expressive.limitSec, 1) : 0} />
              {expressive?.bonusSec ? <Text variant="caption">Includes {formatTimeLeft(expressive.bonusSec)} from Studio packs and invites</Text> : null}
            </View>
            <Text variant="caption">
              {usage.data ? `Monthly minutes reset on ${formatResetDate(usage.data.resetsOn)}. ` : ''}Audio you&apos;ve already heard replays for free.
            </Text>
          </View>
          <RewardAdRow />
          <SettingsRow label="See plans" onPress={() => router.push('/plans')} />
        </SettingsSection>

        <SettingsSection title="Share and listen anywhere">
          <SettingsRow
            icon={<Gift size={19} color={t.foreground} />}
            label="Invite friends"
            detail="You both get 10 Expressive minutes"
            onPress={() => router.push('/invite')}
          />
          <SettingsRow
            icon={<Podcast size={19} color={t.foreground} />}
            label="Private podcast"
            detail="Plus · Your documents in any podcast app"
            onPress={() => router.push('/podcast')}
          />
        </SettingsSection>

        <View className="gap-2.5">
          <View className="flex-row items-baseline justify-between px-1">
            <Text variant="label" className="text-muted">Voices</Text>
            <Text variant="caption">Who reads each language</Text>
          </View>
          {Array.from({ length: Math.ceil(tiles.length / 2) }, (_, row) => (
            <View key={row} className="flex-row gap-2.5">
              {tiles.slice(row * 2, row * 2 + 2)}
            </View>
          ))}
        </View>

        {downloads.length ? (
          <SettingsSection title="Downloads">
            <SettingsRow
              label="Saved for offline"
              value={`${downloads.length === 1 ? '1 item' : `${downloads.length} items`}, ${megabytes(downloadsSize)}`}
            />
            <SettingsRow label="Remove all downloads" destructive onPress={removeDownloads} />
          </SettingsSection>
        ) : null}

        <SettingsSection title="Playback">
          <Text className="px-3 pt-3 text-[16px] font-medium">Speed</Text>
          <ChoiceChips options={SPEEDS} value={prefs?.speed} format={(v) => `${v}×`} onChange={(speed) => save({ speed })} />
          <Text className="px-3 pt-1 text-[16px] font-medium">Daily goal</Text>
          <ChoiceChips options={GOALS} value={prefs?.dailyGoalMinutes} format={(v) => `${v} min`} onChange={(dailyGoalMinutes) => save({ dailyGoalMinutes })} />
          <SettingsRow
            label="Play next automatically"
            detail="When something finishes, the next unfinished item in the same place starts."
            right={
              <Switch
                isSelected={prefs?.autoPlayNext ?? true}
                onSelectedChange={(autoPlayNext) => save({ autoPlayNext })}
                accessibilityLabel="Play next automatically"
              />
            }
          />
        </SettingsSection>

        <SettingsSection title="Appearance">
          <ChoiceChips options={THEMES} value={theme} format={(v) => THEME_LABELS[v]} onChange={setTheme} />
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsRow icon={<Star size={19} color={t.foreground} />} label="Rate ListenUp on Google Play" onPress={() => void openStoreListing()} />
          <SettingsRow icon={<FileText size={19} color={t.foreground} />} label="Terms of service" onPress={() => router.push('/legal/terms')} />
          <SettingsRow icon={<Shield size={19} color={t.foreground} />} label="Privacy policy" onPress={() => router.push('/legal/privacy')} />
          {adPrivacy ? (
            <SettingsRow
              icon={<ShieldCheck size={19} color={t.foreground} />}
              label="Ad privacy choices"
              onPress={() => void showAdPrivacyOptions().catch((e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }))}
            />
          ) : null}
        </SettingsSection>

        <Text variant="caption" className="text-center">ListenUp {Constants.expoConfig?.version ?? ''}</Text>
      </ScrollView>

    </CloudBackground>
  );
}

/** The last tile: every language on the Voices page */
function AllLanguagesTile({ count }: { count: number }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={() => router.push('/voices')}
      accessibilityRole="button"
      className="flex-1 justify-between gap-3 rounded-3xl border border-dashed border-border p-3.5 active:opacity-70"
    >
      <View className="size-10 items-center justify-center rounded-full bg-accent-soft-bg">
        <Languages size={19} color={t.accent} />
      </View>
      <View>
        <Text className="text-[16px] font-bold text-accent">All languages</Text>
        <Text variant="caption">{count} languages, every voice</Text>
      </View>
    </Pressable>
  );
}
