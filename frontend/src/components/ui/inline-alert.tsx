import { useThemeColor } from 'heroui-native';
import { CircleAlert } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from './text';

interface InlineAlertProps {
  message?: string | null;
  action?: ReactNode;
}

/** Form-level error, announced to screen readers when it appears */
export function InlineAlert({ message, action }: InlineAlertProps) {
  const danger = useThemeColor('danger');
  if (!message) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="gap-3 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-3"
    >
      <View className="flex-row gap-2.5">
        <CircleAlert size={18} color={danger} style={{ marginTop: 1 }} />
        <Text className="flex-1 text-[15px] leading-[21px] text-danger">{message}</Text>
      </View>
      {action}
    </View>
  );
}
