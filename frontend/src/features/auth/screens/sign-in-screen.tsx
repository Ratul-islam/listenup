import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
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
import { useGoogleSignIn, useResendVerification, useSignIn } from '../hooks/use-auth-mutations';
import { isGoogleSignInEnabled } from '../lib/google-sign-in';
import { signInSchema, type SignInValues } from '../schemas';

export default function SignInScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const signIn = useSignIn();
  const resendVerification = useResendVerification();
  const google = useGoogleSignIn();

  const { control, handleSubmit, setFocus, getValues } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: params.email ?? '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    google.reset();
    try {
      await signIn.mutateAsync(values);
    } catch (error) {
      if (hasErrorCode(error, 'EMAIL_NOT_VERIFIED')) {
        // Send a fresh code (ignored if one went out recently) and finish verification
        resendVerification.mutate(values.email);
        router.push({ pathname: '/verify-email', params: { email: values.email } });
      }
    }
  });

  const error = signIn.error ?? google.error;
  const errorMessage = error && !hasErrorCode(error, 'EMAIL_NOT_VERIFIED') ? getErrorMessage(error) : null;
  const isBusy = signIn.isPending || google.isPending;

  return (
    <AuthScreen
      title="Welcome back"
      description="Sign in to pick up where you left off."
      footer={
        <View className="flex-row items-center gap-1.5">
          <Text variant="caption">New here?</Text>
          <TextLink onPress={() => router.replace('/sign-up')}>Create an account</TextLink>
        </View>
      }
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
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => setFocus('password')}
        />
        <View className="gap-2.5">
          <FormTextField
            control={control}
            name="password"
            label="Password"
            secure
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
          <TextLink
            className="self-end"
            onPress={() =>
              router.push({ pathname: '/forgot-password', params: { email: getValues('email') } })
            }
          >
            Forgot password?
          </TextLink>
        </View>

        <InlineAlert message={errorMessage} />

        <SubmitButton label="Sign in" onPress={onSubmit} isLoading={signIn.isPending} isDisabled={isBusy} />

        {isGoogleSignInEnabled ? (
          <>
            <OrDivider />
            <GoogleButton
              onPress={() => {
                signIn.reset();
                google.mutate();
              }}
              isLoading={google.isPending}
              isDisabled={isBusy}
            />
          </>
        ) : null}
      </View>
    </AuthScreen>
  );
}
