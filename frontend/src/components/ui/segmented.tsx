import { Pressable, View } from 'react-native';

import { haptics } from '@/lib/haptics';

import { Text } from './text';

interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  /** A small dot after the label, e.g. where the current choice lives */
  marked?: boolean;
}

/** A row of mutually exclusive options ("Subtle | Balanced | Dramatic") */
export function Segmented<T extends string>({ options, value, onChange }: { options: SegmentedOption<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <View className="flex-row rounded-full bg-surface-secondary p-1" accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => {
              haptics.tap();
              onChange(o.id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-full py-2 ${active ? 'bg-surface' : ''}`}
            style={active ? { boxShadow: '0px 2px 8px rgba(80, 99, 184, 0.12)' } : undefined}
          >
            <Text className={`text-[14px] font-semibold ${active ? 'text-accent' : 'text-muted'}`}>{o.label}</Text>
            {o.marked ? <View className="size-1.5 rounded-full bg-accent" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
