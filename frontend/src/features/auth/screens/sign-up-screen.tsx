import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { FormTextField } from '@/components/ui/form-text-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';

import { AuthScreen } from '../components/auth-screen';
import { GoogleButton } from '../components/google-button';
import { OrDivider } from '../components/or-divider';
import { useGoogleSignIn, useSignUp } from '../hooks/use-auth-mutations';
import { isGoogleSignInEnabled } from '../lib/google-sign-in';
import { signUpSchema, type SignUpValues } from '../schemas';

export default function SignUpScreen() {
  const signUp = useSignUp();
  const google = useGoogleSignIn();

  const { control, handleSubmit, setFocus, setError } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    google.reset();
    try {
      await signUp.mutateAsync({ email, password, name: name || undefined });
      router.push({ pathname: '/verify-email', params: { email } });
    } catch (error) {
      if (hasErrorCode(error, 'EMAIL_TAKEN')) {
        setError('email', { message: 'This email already has an account. Sign in instead.' }, { shouldFocus: true });
      }
    }
  });

  const error = signUp.error ?? google.error;
  const errorMessage = error && !hasErrorCode(error, 'EMAIL_TAKEN') ? getErrorMessage(error) : null;
  const isBusy = signUp.isPending || google.isPending;

  return (
    <AuthScreen
      title="Create your account"
      description="You'll confirm your email with a 6-digit code."
      footer={
        <View className="flex-row items-center gap-1.5">
          <Text variant="caption">Already have an account?</Text>
          <TextLink onPress={() => router.replace('/sign-in')}>Sign in</TextLink>
        </View>
      }
    >
      <View className="gap-5">
        <FormTextField
          control={control}
          name="name"
          label="Name"
          placeholder="What should we call you?"
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => setFocus('email')}
        />
        <FormTextField
          control={control}
          name="email"
          label="Email"
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => setFocus('password')}
        />
        <FormTextField
          control={control}
          name="password"
          label="Password"
          description="At least 8 characters."
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />

        <InlineAlert message={errorMessage} />

        <SubmitButton label="Create account" onPress={onSubmit} isLoading={signUp.isPending} isDisabled={isBusy} />

        {isGoogleSignInEnabled ? (
          <>
            <OrDivider />
            <GoogleButton
              onPress={() => {
                signUp.reset();
                google.mutate();
              }}
              isLoading={google.isPending}
              isDisabled={isBusy}
            />
          </>
        ) : null}

        <Text variant="caption" className="text-center">
          By creating an account you agree to the{' '}
          <Text variant="caption" className="font-semibold text-accent-soft-fg" onPress={() => router.push('/legal/terms')} accessibilityRole="link">
            Terms of service
          </Text>{' '}
          and{' '}
          <Text variant="caption" className="font-semibold text-accent-soft-fg" onPress={() => router.push('/legal/privacy')} accessibilityRole="link">
            Privacy policy
          </Text>
          .
        </Text>
      </View>
    </AuthScreen>
  );
}
