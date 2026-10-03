import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { Text } from '@/components/ui/text';

import { authApi } from '../api/auth.api';
import { AuthScreen } from '../components/auth-screen';
import { CodeEntry } from '../components/code-entry';
import { useVerifyResetCode } from '../hooks/use-auth-mutations';

export default function ResetCodeScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const verify = useVerifyResetCode();

  if (!email) return <Redirect href="/forgot-password" />;

  const submit = (otp: string) =>
    verify.mutate(
      { email, otp },
      {
        onSuccess: ({ resetToken }) =>
          router.replace({ pathname: '/new-password', params: { email, resetToken } }),
      },
    );

  return (
    <AuthScreen
      title="Enter your reset code"
      description={
        <>
          If <Text className="font-semibold text-foreground">{email}</Text> has an account, we sent it a
          6-digit code.
        </>
      }
    >
      <CodeEntry
        submitLabel="Continue"
        onSubmit={submit}
        onResend={() => authApi.forgotPassword(email)}
        onEdit={verify.reset}
        isPending={verify.isPending}
        error={verify.error}
      />
    </AuthScreen>
  );
}
