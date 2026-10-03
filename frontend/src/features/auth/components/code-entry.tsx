import { useState } from 'react';
import { View } from 'react-native';

import { InlineAlert } from '@/components/ui/inline-alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';

import { OTP_LENGTH } from '../schemas';
import { OtpField } from './otp-field';
import { ResendCode } from './resend-code';

interface CodeEntryProps {
  submitLabel: string;
  onSubmit: (code: string) => void;
  onResend: () => Promise<unknown>;
  /** Clears the previous attempt's error when the code changes */
  onEdit: () => void;
  isPending: boolean;
  error: unknown;
}

/** Shared 6-digit code form for email verification and password reset */
export function CodeEntry({ submitLabel, onSubmit, onResend, onEdit, isPending, error }: CodeEntryProps) {
  const [code, setCode] = useState('');

  const isWrongCode = hasErrorCode(error, 'INVALID_OTP', 'OTP_ATTEMPTS_EXCEEDED');
  const message = hasErrorCode(error, 'INVALID_OTP')
    ? "That code isn't right or has expired. Check the latest email and try again."
    : error
      ? getErrorMessage(error)
      : null;

  return (
    <View className="gap-6">
      <OtpField
        value={code}
        onChange={(value) => {
          setCode(value);
          if (error) onEdit();
        }}
        onComplete={onSubmit}
        isInvalid={isWrongCode}
        isDisabled={isPending}
      />

      <InlineAlert message={message} />

      <SubmitButton
        label={submitLabel}
        onPress={() => onSubmit(code)}
        isLoading={isPending}
        isDisabled={code.length < OTP_LENGTH}
      />

      <ResendCode onResend={onResend} />
    </View>
  );
}
