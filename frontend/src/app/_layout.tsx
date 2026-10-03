import '@/global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useThemeColor } from 'heroui-native';
import { useEffect } from 'react';

import { useAuthStore } from '@/features/auth/store/auth.store';
import { applyStoredTheme } from '@/lib/theme';
import { AppProviders } from '@/providers/app-providers';

SplashScreen.preventAutoHideAsync();
applyStoredTheme();

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="auto" />
      <RootNavigator />
    </AppProviders>
  );
}

function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const hydrate = useAuthStore((s) => s.hydrate);
  const background = useThemeColor('background');

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);

  // Splash screen stays up while the stored session is restored
  if (status === 'loading') return null;

  const isSignedIn = status === 'signedIn';

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: background } }}>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      {/* Readable signed in or out (e.g. before creating an account) */}
      <Stack.Screen name="legal/[doc]" />
    </Stack>
  );
}
