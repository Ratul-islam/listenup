import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { Text } from '@/components/ui/text';
import { emotionMeta } from '@/features/expression/catalog';
import type { ExpressionTarget } from '@/features/expression/components/expression-sheet';
import { emotionsIn } from '@/features/expression/lib/marks';
import { useTokens } from '@/lib/use-tokens';

import { useSyncPosition } from '../hooks/use-sync-position';
import { usePlayerStore } from '../store/player.store';

interface SyncedTextProps {
  onOpenTranscript: () => void;
  /** Opens "How should this sound?" for the sentence being spoken */
  onEditLine: (target: ExpressionTarget) => void;
}

/** The sentence being spoken, filling in word by word */
export function SyncedText({ onOpenTranscript, onEditLine }: SyncedTextProps) {
  const t = useTokens();
  const chunks = usePlayerStore((s) => s.chunks);
  const chunkIndex = usePlayerStore((s) => s.chunkIndex);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const chunk = chunks[chunkIndex];
  const { sentenceIndex, spokenChars } = useSyncPosition(chunk, positionMs);

  if (!chunk) return <GlassCard className="flex-1" />;

  const sentence = chunk.sentences[sentenceIndex];
  const text = chunk.text.slice(sentence.start, sentence.end);
  // Highlight whole words: extend the spoken part to the end of the current word
  const wordEnd = text.slice(Math.round(spokenChars)).search(/\s/);
  const cut = wordEnd === -1 ? text.length : Math.round(spokenChars) + wordEnd;
  const moods = emotionsIn(chunk.expressions, sentence).map((e) => emotionMeta[e]);

  return (
    <GlassCard raised className="flex-1 px-6 pb-3 pt-6">
      <View className="flex-1 justify-center overflow-hidden">
        <Text className="text-[24px] font-bold leading-[34px] tracking-[-0.3px]" accessibilityLiveRegion="polite" numberOfLines={7}>
          <Text className="text-accent">{text.slice(0, cut)}</Text>
          <Text className="text-foreground">{text.slice(cut)}</Text>
        </Text>
      </View>

      <View className="flex-row items-center justify-between pt-2">
        <Pressable
          onPress={() => onEditLine({ chunkIndex, sentenceIndex })}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={moods.length ? `This line sounds ${moods.map((m) => m.label).join(' and ')}. Change it` : 'Add emotion to this line'}
          className="flex-row items-center gap-1.5 rounded-full px-2 py-2 active:bg-default"
        >
          <Text className="text-[15px]">{moods.length ? moods.map((m) => m.emoji).join('') : '🎭'}</Text>
          <Text className="text-[14px] font-medium text-muted" numberOfLines={1}>
            {moods.length ? moods.map((m) => m.label).join(', ') : 'Add emotion'}
          </Text>
        </Pressable>
        <Pressable onPress={onOpenTranscript} hitSlop={6} accessibilityRole="button" className="flex-row items-center gap-0.5 rounded-full py-2 pl-2 pr-1 active:bg-default">
          <Text className="text-[14px] font-medium text-muted">Transcript</Text>
          <ChevronRight size={16} color={t.muted} />
        </Pressable>
      </View>
    </GlassCard>
  );
}
