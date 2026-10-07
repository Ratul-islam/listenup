import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Avatar, Spinner, useToast } from 'heroui-native';
import { LogOut, UserX } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ui/action-sheet';
import { CloudBackground } from '@/components/ui/cloud-background';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenHeader, SettingsRow, SettingsSection } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { authApi } from '@/features/auth/api/auth.api';
import { useSignOut } from '@/features/auth/hooks/use-auth-mutations';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { initials } from '@/features/voices/voice-catalog';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { accountApi } from '../api/account.api';
import { SettingsSections } from '../components/settings-sections';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const signOut = useSignOut();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  if (!user) return null;
  const changed = name.trim() !== (user.name ?? '') && name.trim().length > 0;

  const saveName = async () => {
    setSaving(true);
    try {
      setUser(await accountApi.updateProfile({ name: name.trim() }));
      haptics.success();
      toast.show({ label: 'Name saved' });
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const closeAccount = async () => {
    setCloseBusy(true);
    setCloseError(null);
    try {
      const { deleteAfter } = await accountApi.close();
      setClosing(false);
      toast.show({ label: 'Account closed', description: `Sign in before ${formatDate(deleteAfter)} to restore it.` });
      signOut.mutate();
    } catch (e) {
      setCloseError(getErrorMessage(e));
      setCloseBusy(false);
    }
  };

  return (
    <CloudBackground>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 24 }}
      >
        <ScreenHeader title="Profile and settings" onBack={router.back} />

        <View className="flex-row items-center gap-4">
          <Avatar size="lg" alt={user.name ?? user.email}>
            {user.avatarUrl ? <Avatar.Image source={{ uri: user.avatarUrl }} /> : null}
            <Avatar.Fallback>{initials(user.name ?? user.email)}</Avatar.Fallback>
          </Avatar>
          <View className="flex-1">
            <Text variant="title" numberOfLines={1}>{user.name ?? 'Your account'}</Text>
            <Text variant="caption" numberOfLines={1}>{user.email}</Text>
          </View>
        </View>

        <SettingsSections />

        <SettingsSection title="Name">
          <View className="flex-row items-center gap-2 p-1.5">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={t.muted}
              maxLength={100}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={() => changed && void saveName()}
              accessibilityLabel="Name"
              className="h-11 flex-1 rounded-xl px-2.5 font-sans text-[16px] text-foreground"
            />
            {changed ? (
              <Pressable onPress={() => void saveName()} disabled={saving} accessibilityRole="button" className="h-10 items-center justify-center rounded-full bg-accent px-4 active:opacity-85">
                {saving ? <Spinner size="sm" color={t.accentForeground} /> : <Text className="text-[14px] font-semibold text-accent-foreground">Save</Text>}
              </Pressable>
            ) : null}
          </View>
        </SettingsSection>

        <SettingsSection title="Sign-in" footer={user.hasPassword ? undefined : 'You sign in with Google.'}>
          <SettingsRow label="Email" value={user.email} />
        </SettingsSection>

        <SettingsSection>
          <SettingsRow icon={<LogOut size={19} color={t.foreground} />} label="Sign out" onPress={() => signOut.mutate()} right={<View />} />
          <SettingsRow
            icon={<LogOut size={19} color={t.muted} />}
            label="Sign out on all devices"
            right={<View />}
            onPress={() =>
              authApi
                .logoutAll()
                .then(() => signOut.mutate())
                .catch((e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }))
            }
          />
        </SettingsSection>

        <SettingsSection>
          <SettingsRow icon={<UserX size={19} color={t.danger} />} label="Close account" destructive onPress={() => setClosing(true)} right={<View />} />
        </SettingsSection>

        <Text variant="caption" className="text-center">ListenUp {Constants.expoConfig?.version ?? ''}</Text>
      </KeyboardAwareScrollView>

      <ActionSheet visible={closing} onClose={() => !closeBusy && setClosing(false)} title="Close your account?">
        <View className="gap-4">
          <Text className="text-[15px] leading-[23px] text-muted">
            You&apos;ll be signed out on every device. Your documents, audio and listening history are kept for 30 days, then deleted for good.
          </Text>
          <Text className="text-[15px] leading-[23px] text-muted">Changed your mind? Just sign in again within 30 days and everything comes back.</Text>
          <InlineAlert message={closeError} />
          <Pressable
            onPress={() => void closeAccount()}
            disabled={closeBusy}
            accessibilityRole="button"
            className="h-14 flex-row items-center justify-center rounded-full bg-danger active:opacity-85"
          >
            {closeBusy ? <Spinner size="sm" color="#fff" /> : <Text className="text-[16px] font-semibold text-danger-foreground">Close my account</Text>}
          </Pressable>
          <PrimaryButton label="Keep my account" variant="secondary" onPress={() => setClosing(false)} isDisabled={closeBusy} />
        </View>
      </ActionSheet>
    </CloudBackground>
  );
}
