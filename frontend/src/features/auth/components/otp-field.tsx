import { InputOTP, REGEXP_ONLY_DIGITS } from 'heroui-native';

import { OTP_LENGTH } from '../schemas';

interface OtpFieldProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  isInvalid?: boolean;
  isDisabled?: boolean;
}

const FIRST = [0, 1, 2];
const SECOND = [3, 4, 5];

export function OtpField({ value, onChange, onComplete, isInvalid, isDisabled }: OtpFieldProps) {
  return (
    <InputOTP
      maxLength={OTP_LENGTH}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      textInputProps={{
        accessibilityLabel: `${OTP_LENGTH}-digit code`,
        autoFocus: true, textContentType: 'oneTimeCode', autoComplete: 'one-time-code' }}
      isInvalid={isInvalid}
      isDisabled={isDisabled}
    >
      <InputOTP.Group className="flex-1 gap-2">
        {FIRST.map((i) => (
          <InputOTP.Slot key={i} index={i} className="h-14 flex-1" />
        ))}
      </InputOTP.Group>
      <InputOTP.Separator />
      <InputOTP.Group className="flex-1 gap-2">
        {SECOND.map((i) => (
          <InputOTP.Slot key={i} index={i} className="h-14 flex-1" />
        ))}
      </InputOTP.Group>
    </InputOTP>
  );
}
