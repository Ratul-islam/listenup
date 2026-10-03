import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { GlassCard } from './glass-card';
import { Text } from './text';

/** A titled group of settings rows on one flat card */
export function SettingsSection({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      {title ? <Text variant="label" className="px-1 text-muted">{title}</Text> : null}
      <GlassCard className="p-1.5">{children}</GlassCard>
      {footer ? <Text variant="caption" className="px-1">{footer}</Text> : null}
    </View>
  );
}

interface SettingsRowProps {
  label: string;
  detail?: string;
  /** Current value, shown muted on the right */
  value?: string;
  icon?: ReactNode;
  /** Replaces the chevron (e.g. a switch) */
  right?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}

export function SettingsRow({ label, detail, value, icon, right, onPress, destructive }: SettingsRowProps) {
  const t = useTokens();
  const body = (
    <>
      {icon ? <View className="w-6 items-center">{icon}</View> : null}
      <View className="flex-1 gap-0.5">
        <Text className={`text-[16px] font-medium ${destructive ? 'text-danger' : ''}`}>{label}</Text>
        {detail ? <Text variant="caption">{detail}</Text> : null}
      </View>
      {value ? <Text className="text-[15px] text-muted" numberOfLines={1}>{value}</Text> : null}
      {right ?? (onPress ? <ChevronRight size={18} color={t.muted} /> : null)}
    </>
  );
  const className = 'min-h-[52px] flex-row items-center gap-3 rounded-2xl px-3 py-3';

  if (!onPress) return <View className={className}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className={`${className} active:bg-default`}>
      {body}
    </Pressable>
  );
}

/** Pick one of a few values ("1×", "30 min", "Dark") */
export function ChoiceChips<T extends string | number>({ options, value, format, onChange }: { options: T[]; value?: T; format: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2 px-3 pb-3 pt-1">
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={String(o)}
            onPress={() => {
              haptics.tap();
              onChange(o);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            className={`rounded-full px-4 py-2 ${active ? 'bg-accent-soft-bg' : 'bg-surface-secondary'}`}
          >
            <Text className={`text-[14px] ${active ? 'font-semibold text-accent-soft-fg' : 'font-medium text-muted'}`}>{format(o)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Back button + large title, for pushed screens */
export function ScreenHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  const t = useTokens();
  return (
    <View className="gap-2">
      <View className="h-11 flex-row items-center justify-between">
        <Pressable onPress={onBack} hitSlop={6} accessibilityRole="button" accessibilityLabel="Back" className="-ml-2.5 size-11 items-center justify-center rounded-full active:bg-default">
          <ChevronLeft size={24} color={t.foreground} />
        </Pressable>
        {right}
      </View>
      <Text variant="h1" accessibilityRole="header">{title}</Text>
    </View>
  );
}
