import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Button, useToast } from 'heroui-native';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { FormTextField } from '@/components/ui/form-text-field';
import { InlineAlert } from '@/components/ui/inline-alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';

import { AuthScreen } from '../components/auth-screen';
import { useResetPassword } from '../hooks/use-auth-mutations';
import { newPasswordSchema, type NewPasswordValues } from '../schemas';

export default function NewPasswordScreen() {
  const { email, resetToken } = useLocalSearchParams<{ email?: string; resetToken?: string }>();
  const reset = useResetPassword();
  const { toast } = useToast();

  const { control, handleSubmit, setFocus } = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  if (!resetToken) return <Redirect href="/forgot-password" />;

  const onSubmit = handleSubmit(({ password }) =>
    reset.mutate(
      { resetToken, password },
      {
        onSuccess: () => {
          toast.show({
            variant: 'success',
            label: 'Password updated',
            description: 'Sign in with your new password.',
          });
          router.dismissTo({ pathname: '/sign-in', params: { email } });
        },
      },
    ),
  );

  const isExpired = hasErrorCode(reset.error, 'INVALID_RESET_TOKEN');

  return (
    <AuthScreen
      title="Choose a new password"
      description="This also signs you out on your other devices."
    >
      <View className="gap-5">
        <FormTextField
          control={control}
          name="password"
          label="New password"
          description="At least 8 characters."
          secure
          autoFocus
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => setFocus('confirmPassword')}
        />
        <FormTextField
          control={control}
          name="confirmPassword"
          label="Confirm new password"
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />

        <InlineAlert
          message={
            isExpired
              ? 'This reset session has expired. Request a new code to continue.'
              : reset.error
                ? getErrorMessage(reset.error)
                : null
          }
          action={
            isExpired ? (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onPress={() => router.dismissTo({ pathname: '/forgot-password', params: { email } })}
              >
                Request a new code
              </Button>
            ) : null
          }
        />

        <SubmitButton label="Update password" onPress={onSubmit} isLoading={reset.isPending} isDisabled={isExpired} />
      </View>
    </AuthScreen>
  );
}
