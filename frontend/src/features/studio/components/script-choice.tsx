import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { DocumentSummary } from '@/features/library/types';
import { useTokens } from '@/lib/use-tokens';

import { formatClock } from '../lib/time';

/** Pick one of your scripts: the ones made for this page's platforms first */
export function ScriptChoice({ scripts, onPick, empty }: { scripts: DocumentSummary[]; onPick: (script: DocumentSummary) => void; empty: string }) {
  const t = useTokens();
  const ready = scripts.filter((s) => s.status === 'READY');
  if (!ready.length) return <Text variant="caption" className="px-1 py-4 text-center">{empty}</Text>;
  return (
    <View className="gap-1 rounded-2xl bg-surface-secondary p-1.5">
      {ready.slice(0, 30).map((s) => (
        <Pressable key={s.id} onPress={() => onPick(s)} accessibilityRole="button" className="min-h-[52px] flex-row items-center gap-3 rounded-xl px-3 py-2.5 active:bg-default">
          <View className="flex-1 gap-0.5">
            <Text className="text-[15px] font-semibold" numberOfLines={1}>{s.title}</Text>
            <Text variant="caption">{formatClock(s.estimatedDurationSec)}</Text>
          </View>
          <ChevronRight size={16} color={t.muted} />
        </Pressable>
      ))}
    </View>
  );
}
