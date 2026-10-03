import type { Tabs } from 'expo-router';
import { Compass, Library, MicVocal } from 'lucide-react-native';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { cardShadow, useTokens } from '@/lib/use-tokens';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS = { index: Library, explore: Compass, studio: MicVocal } as const;
const LABELS = { index: 'Soundshelf', explore: 'Explore', studio: 'Studio' } as const;

/** Floating tab bar; the active tab is the only coloured thing in it */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const t = useTokens();

  return (
    <View className="px-4" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
      <View className="flex-row rounded-3xl bg-surface px-2 py-1.5 dark:border dark:border-border" style={{ boxShadow: cardShadow }}>
        {state.routes.map((route, index) => {
          const name = route.name as keyof typeof ICONS;
          const Icon = ICONS[name] ?? Library;
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={LABELS[name]}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  haptics.tap();
                  navigation.navigate(route.name);
                }
              }}
              className="flex-1 items-center gap-0.5 rounded-2xl py-1.5 active:opacity-70"
            >
              <Icon size={22} color={focused ? t.accent : t.muted} strokeWidth={focused ? 2.2 : 1.8} />
              <Text className={`text-[11.5px] ${focused ? 'font-semibold text-accent' : 'font-medium text-muted'}`}>{LABELS[name] ?? route.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
