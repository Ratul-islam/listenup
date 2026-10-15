import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

/** A box to tick, with what ticking it says */
export function Tick({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onChange(!checked);
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="flex-row items-center gap-3 rounded-2xl px-1 py-1 active:opacity-80"
    >
      <View className={`size-6 items-center justify-center rounded-md border-2 ${checked ? 'border-accent bg-accent' : 'border-border'}`}>
        {checked ? <Check size={15} color={t.accentForeground} strokeWidth={3} /> : null}
      </View>
      <Text className="flex-1 text-[15px] leading-[21px]">{label}</Text>
    </Pressable>
  );
}
