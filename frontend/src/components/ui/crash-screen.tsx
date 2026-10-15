import type { ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { reportError } from '@/lib/crash-reports';

/**
 * Shown when a screen fails to draw, instead of the app closing. It sits
 * outside the app's providers (one of them may be what failed), so it's
 * built from plain views. The error goes to crash reports.
 */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error);
    // It may fail while the splash screen is still up
    void SplashScreen.hideAsync();
  }, [error]);

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
      <Text className="text-center text-xl font-bold text-foreground">Something went wrong</Text>
      <Text className="text-center text-base text-muted">This screen couldn’t open. We’ve been told about it. Try again, or close and reopen ListenUp.</Text>
      <Pressable
        onPress={() => void retry()}
        accessibilityRole="button"
        className="mt-3 min-h-12 justify-center rounded-full bg-accent px-7 active:opacity-80"
      >
        <Text className="text-base font-semibold text-accent-foreground">Try again</Text>
      </Pressable>
    </View>
  );
}
