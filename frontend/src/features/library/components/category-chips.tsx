import { Pressable, ScrollView } from 'react-native';

import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';

import { CATEGORIES } from '../lib/kind-meta';
import type { Category } from '../types';

interface CategoryChipsProps {
  value: Category;
  onChange: (value: Category) => void;
}

/** Type filter: plain words, the selected one sits on a soft violet chip */
export function CategoryChips({ value, onChange }: CategoryChipsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1 px-5">
      {CATEGORIES.map((c) => {
        const active = c.id === value;
        return (
          <Pressable
            key={c.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptics.tap();
              onChange(c.id);
            }}
            className={`rounded-full px-3.5 py-2 ${active ? 'bg-accent-soft-bg' : 'active:bg-default'}`}
          >
            <Text className={`text-[14px] ${active ? 'font-semibold text-accent-soft-fg' : 'font-medium text-muted'}`}>{c.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
