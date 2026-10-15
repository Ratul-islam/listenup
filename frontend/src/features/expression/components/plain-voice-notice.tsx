import { Spinner } from 'heroui-native';
import { Info } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { useExpressiveSwitch } from '../hooks/use-expressive-switch';

/**
 * Shown where emotions are chosen while a Natural or Phone voice is reading:
 * says plainly that it can't act them out, and offers the Expressive voice
 * that can. Nothing changes until that's tapped. Renders nothing for voices that can.
 */
export function PlainVoiceNotice({ chunkIndex, className }: { chunkIndex?: number; className?: string }) {
  const t = useTokens();
  const { plain, current, suggestion, switching, switchNow } = useExpressiveSwitch(chunkIndex);
  if (!plain) return null;

  return (
    <View className={`flex-row items-center gap-2.5 rounded-2xl bg-accent-soft-bg px-3.5 py-2.5 ${className ?? ''}`} accessibilityRole="alert">
      <Info size={17} color={t.accentSoftFg} />
      <Text className="flex-1 text-[13px] leading-[18px] text-accent-soft-fg">
        {current?.name ?? 'This voice'} reads without emotions.{suggestion ? ` ${suggestion.name} can act them out.` : ' Your choices are saved for an Expressive voice.'}
      </Text>
      {suggestion ? (
        <Pressable
          onPress={() => {
            haptics.tap();
            void switchNow();
          }}
          disabled={switching}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Switch to ${suggestion.name}, an Expressive voice`}
          className="min-h-9 min-w-[76px] flex-row items-center justify-center rounded-full bg-accent px-3.5 active:opacity-80"
        >
          {switching ? <Spinner size="sm" color={t.accentForeground} /> : <Text className="text-[13px] font-semibold text-accent-foreground">Use {suggestion.name}</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}
