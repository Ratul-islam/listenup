import { Pressable } from 'react-native';

import { Text } from '@/components/ui/text';

/** A choice pill: emoji and label, tinted when chosen */
export function Chip({ emoji, label, active, color, onPress }: { emoji?: string; label: string; active: boolean; color?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 active:opacity-70 ${active ? 'bg-accent-soft-bg' : 'bg-surface-secondary'}`}
      style={active && color ? { backgroundColor: `${color}2e` } : undefined}
    >
      {emoji ? <Text className="text-[17px] leading-[22px]">{emoji}</Text> : null}
      <Text className={`text-[14px] font-semibold ${active ? 'text-foreground' : 'text-muted'}`}>{label}</Text>
    </Pressable>
  );
}
