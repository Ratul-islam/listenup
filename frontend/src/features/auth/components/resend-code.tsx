import { useToast } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';

import { useCountdown } from '../hooks/use-countdown';

const COOLDOWN_SECONDS = 60;

interface ResendCodeProps {
  onResend: () => Promise<unknown>;
}

const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** "Resend code" with the same cooldown the server enforces */
export function ResendCode({ onResend }: ResendCodeProps) {
  // A code was just sent when this screen opened
  const { remaining, isRunning, restart } = useCountdown(COOLDOWN_SECONDS);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const resend = async () => {
    setIsSending(true);
    try {
      await onResend();
      restart();
      toast.show({ variant: 'success', label: 'New code sent', description: 'Check your inbox and spam folder.' });
    } catch (error) {
      if (hasErrorCode(error, 'OTP_COOLDOWN')) {
        const seconds = Number(/(\d+)s/.exec(error.message)?.[1]);
        restart(Number.isFinite(seconds) ? seconds : COOLDOWN_SECONDS);
      } else {
        toast.show({ variant: 'danger', label: getErrorMessage(error) });
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View className="flex-row flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
      <Text variant="caption">Didn&apos;t get a code?</Text>
      {isRunning || isSending ? (
        <Text variant="caption" accessibilityLiveRegion="polite">
          {isSending ? 'Sending…' : `Resend in ${formatSeconds(remaining)}`}
        </Text>
      ) : (
        <TextLink onPress={resend}>Resend code</TextLink>
      )}
    </View>
  );
}
