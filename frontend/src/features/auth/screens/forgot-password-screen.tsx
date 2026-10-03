import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { FormTextField } from '@/components/ui/form-text-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';

import { AuthScreen } from '../components/auth-screen';
import { useForgotPassword } from '../hooks/use-auth-mutations';
import { emailSchema, type EmailValues } from '../schemas';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const forgot = useForgotPassword();

  const { control, handleSubmit } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: params.email ?? '' },
  });

  const goToCode = (email: string) => router.push({ pathname: '/reset-code', params: { email } });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await forgot.mutateAsync(email);
      goToCode(email);
    } catch (error) {
      // A code was sent moments ago; let them enter that one
      if (hasErrorCode(error, 'OTP_COOLDOWN')) goToCode(email);
    }
  });

  const errorMessage =
    forgot.error && !hasErrorCode(forgot.error, 'OTP_COOLDOWN') ? getErrorMessage(forgot.error) : null;

  return (
    <AuthScreen
      title="Reset your password"
      description="Enter the email you signed up with and we'll send you a code to reset it."
    >
      <View className="gap-5">
        <FormTextField
          control={control}
          name="email"
          label="Email"
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          autoFocus={!params.email}
          returnKeyType="send"
          onSubmitEditing={onSubmit}
        />
        <InlineAlert message={errorMessage} />
        <SubmitButton label="Send code" onPress={onSubmit} isLoading={forgot.isPending} />
      </View>
    </AuthScreen>
  );
}
