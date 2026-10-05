import { Pressable, View } from 'react-native';

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

/** A row of mutually exclusive options ("Subtle | Balanced | Dramatic") */
export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <View className="flex-row rounded-full bg-surface-secondary p-1" accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`flex-1 items-center rounded-full py-2 ${active ? 'bg-surface' : ''}`}
            style={active ? { boxShadow: '0px 2px 8px rgba(80, 99, 184, 0.12)' } : undefined}
          >
            <Text className={`text-[14px] font-semibold ${active ? 'text-accent' : 'text-muted'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
