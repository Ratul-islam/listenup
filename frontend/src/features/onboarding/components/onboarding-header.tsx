import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

interface OnboardingHeaderProps {
  step: number;
  total: number;
  onSkip?: () => void;
}

/** Progress dots and Skip */
export function OnboardingHeader({ step, total, onSkip }: OnboardingHeaderProps) {
  return (
    <View className="h-11 flex-row items-center justify-between px-5">
      <View
        className="flex-row items-center gap-1.5"
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${step + 1} of ${total}`}
      >
        {Array.from({ length: total }, (_, i) => (
          <View key={i} className={i === step ? 'h-1.5 w-5 rounded-full bg-accent' : 'size-1.5 rounded-full bg-surface-tertiary'} />
        ))}
      </View>

      {onSkip ? (
        <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button" className="rounded-full px-3 py-2 active:bg-default">
          <Text className="text-[15px] font-medium text-muted">Skip</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
