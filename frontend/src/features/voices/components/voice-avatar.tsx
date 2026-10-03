import { View } from 'react-native';

import { Text } from '@/components/ui/text';

import { initials } from '../voice-catalog';

/** Initials on a soft violet tile */
export function VoiceAvatar({ name, size = 44 }: { name: string; language?: 'en' | 'bn'; size?: number }) {
  return (
    <View className="items-center justify-center bg-accent-soft-bg" style={{ width: size, height: size, borderRadius: size / 2 }}>
      <Text className="font-semibold text-accent-soft-fg" style={{ fontSize: size * 0.34 }}>{initials(name)}</Text>
    </View>
  );
}
