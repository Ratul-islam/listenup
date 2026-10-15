import { Heart } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { heartsLabel } from '../lib/format';

/** ♥ and a count; filled once you've hearted it. Without onPress it only shows the count. */
export function HeartButton({ hearts, hearted, onPress, size = 'sm' }: { hearts: number; hearted: boolean; onPress?: () => void; size?: 'sm' | 'md' }) {
  const t = useTokens();
  const icon = size === 'md' ? 20 : 16;
  const label = (
    <>
      <Heart size={icon} color={hearted ? t.danger : t.muted} fill={hearted ? t.danger : 'transparent'} />
      <Text className={`${size === 'md' ? 'text-[15px]' : 'text-[13px]'} font-semibold ${hearted ? 'text-danger' : 'text-muted'}`}>{hearts}</Text>
    </>
  );
  if (!onPress) {
    return (
      <Pressable disabled accessibilityLabel={heartsLabel(hearts)} className="flex-row items-center gap-1">
        {label}
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: hearted }}
      accessibilityLabel={`${hearted ? 'Remove your heart' : 'Heart it'}, ${heartsLabel(hearts)}`}
      className={`flex-row items-center gap-1.5 rounded-full active:opacity-70 ${size === 'md' ? 'bg-surface-secondary px-4 py-2.5' : 'px-1 py-1'}`}
    >
      {label}
    </Pressable>
  );
}
