import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { authApi } from '../api/auth.api';
import { AuthScreen } from '../components/auth-screen';
import { CodeEntry } from '../components/code-entry';
import { useVerifyEmail } from '../hooks/use-auth-mutations';
import { heldPassword } from '../lib/pending-password';

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const verify = useVerifyEmail();
  // The password goes with the code. Read once: it's forgotten as soon as the code is accepted
  const [password] = useState(() => (email ? heldPassword(email) : null));

  if (!email) return <Redirect href="/sign-up" />;
  // Without it (the app was closed in between), signing in again brings the user back here with it
  if (!password) return <Redirect href={{ pathname: '/sign-in', params: { email } }} />;

  return (
    <AuthScreen
      title="Check your email"
      description={
        <>
          Enter the 6-digit code we sent to <Text className="font-semibold text-foreground">{email}</Text>.
        </>
      }
      footer={
        <View className="items-center gap-2">
          <View className="flex-row items-center gap-1.5">
            <Text variant="caption">Wrong email?</Text>
            <TextLink onPress={() => router.back()}>Change it</TextLink>
          </View>
          {/* Sign-up answers the same for an email that has an account; its owner gets a note instead of a code */}
          <View className="flex-row items-center gap-1.5">
            <Text variant="caption">Got an email saying you have an account?</Text>
            <TextLink onPress={() => router.replace({ pathname: '/sign-in', params: { email } })}>Sign in</TextLink>
          </View>
        </View>
      }
    >
      <CodeEntry
        submitLabel="Verify email"
        onSubmit={(otp) => verify.mutate({ email, otp, password })}
        onResend={() => authApi.resendVerification(email)}
        onEdit={verify.reset}
        isPending={verify.isPending}
        error={verify.error}
      />
    </AuthScreen>
  );
}
