import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export function OrDivider() {
  return (
    <View className="flex-row items-center gap-3 py-1" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View className="h-px flex-1 bg-separator/60" />
      <Text variant="caption">or</Text>
      <View className="h-px flex-1 bg-separator/60" />
    </View>
  );
}
