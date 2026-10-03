import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { authApi } from '../api/auth.api';
import { AuthScreen } from '../components/auth-screen';
import { CodeEntry } from '../components/code-entry';
import { useVerifyEmail } from '../hooks/use-auth-mutations';

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const verify = useVerifyEmail();

  if (!email) return <Redirect href="/sign-up" />;

  return (
    <AuthScreen
      title="Check your email"
      description={
        <>
          Enter the 6-digit code we sent to <Text className="font-semibold text-foreground">{email}</Text>.
        </>
      }
      footer={
        <View className="flex-row items-center gap-1.5">
          <Text variant="caption">Wrong email?</Text>
          <TextLink onPress={() => router.back()}>Change it</TextLink>
        </View>
      }
    >
      <CodeEntry
        submitLabel="Verify email"
        onSubmit={(otp) => verify.mutate({ email, otp })}
        onResend={() => authApi.resendVerification(email)}
        onEdit={verify.reset}
        isPending={verify.isPending}
        error={verify.error}
      />
    </AuthScreen>
  );
}
