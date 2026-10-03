import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Avatar, Switch, useToast } from 'heroui-native';
import { ChevronRight, FileText, Shield, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ChoiceChips, SettingsRow, SettingsSection } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useListeningStats } from '@/features/library/hooks/use-documents';
import { usePlayerStore } from '@/features/player/store/player.store';
import { VoiceAvatar } from '@/features/voices/components/voice-avatar';
import { VoicePickerSheet } from '@/features/voices/components/voice-picker-sheet';
import { useUpdatePreferences, useUsage, useVoices } from '@/features/voices/hooks/use-voices';
import { initials } from '@/features/voices/voice-catalog';
import { getErrorMessage } from '@/lib/api/api-error';
import { useThemePreference, type ThemePreference } from '@/lib/theme';
import { useTokens } from '@/lib/use-tokens';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const GOALS = [15, 30, 45, 60];
const THEMES: ThemePreference[] = ['system', 'light', 'dark'];
const THEME_LABELS: Record<ThemePreference, string> = { system: 'Match phone', light: 'Light', dark: 'Dark' };
// Rough reading rate, to express the character allowance as listening time
const CHARS_PER_MINUTE = 14 * 60;
const PACKAGE = Constants.expoConfig?.android?.package ?? 'dev.ratul.tts';

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
  const [picking, setPicking] = useState<'en' | 'bn' | null>(null);
  const prefs = data?.preferences;

  const save = (body: Parameters<typeof update.mutate>[0]) =>
    update.mutate(body, { onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }) });

  const voiceRow = (lang: 'en' | 'bn') => {
    const voice = data?.voices.find((v) => v.id === (lang === 'en' ? prefs?.voiceEnId : prefs?.voiceBnId));
    return (
      <Pressable key={lang} onPress={() => setPicking(lang)} accessibilityRole="button" className="flex-row items-center gap-3 rounded-2xl p-2.5 active:bg-default">
        <VoiceAvatar name={voice?.name ?? '?'} size={40} />
        <Text className="flex-1 text-[16px] font-medium">{lang === 'en' ? 'English' : 'বাংলা'}</Text>
        <Text className="text-[15px] text-muted">{voice?.name ?? '…'}</Text>
        <ChevronRight size={18} color={t.muted} />
      </Pressable>
    );
  };

  const used = usage.data?.usedCharacters ?? 0;
  const limit = usage.data?.limitCharacters ?? 1;
  const minutesLeft = Math.floor((usage.data?.remainingCharacters ?? 0) / CHARS_PER_MINUTE);
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
              <Text variant="caption">{minutesLeft} min left this month</Text>
            </View>
            <ProgressBar value={used / limit} />
            <Text variant="caption">Resets on the 1st. Audio you&apos;ve already heard replays for free.</Text>
          </View>
          <SettingsRow label="See plans" onPress={() => router.push('/plans')} />
        </SettingsSection>

        <SettingsSection title="Voices">
          {voiceRow('en')}
          {voiceRow('bn')}
        </SettingsSection>

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
        </SettingsSection>

        <Text variant="caption" className="text-center">ListenUp {Constants.expoConfig?.version ?? ''}</Text>
      </ScrollView>

      <VoicePickerSheet
        visible={picking !== null}
        onClose={() => setPicking(null)}
        languages={picking ? [picking] : undefined}
        title={picking === 'bn' ? 'Default বাংলা voice' : 'Default English voice'}
        selectedIds={[prefs?.voiceEnId ?? '', prefs?.voiceBnId ?? '']}
        onSelect={(v) => {
          save(v.language === 'en' ? { voiceEnId: v.id } : { voiceBnId: v.id });
          setPicking(null);
        }}
      />
    </CloudBackground>
  );
}
