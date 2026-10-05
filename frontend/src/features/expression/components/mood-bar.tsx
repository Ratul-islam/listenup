import { useToast } from 'heroui-native';
import { MoreHorizontal } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { emotionMeta, QUICK_EMOTIONS, type EmotionId, type EmotionMark } from '../catalog';
import { applyEmotion } from '../lib/apply';
import { markOf, type Range } from '../lib/marks';

interface MoodBarProps {
  chunkIndex: number;
  /** The line it acts on: the one just heard */
  line: Range;
  /** The mark on that line now, if any */
  mark: EmotionMark | null;
  /** Opens the full "How should this sound?" sheet for the line */
  onMore: () => void;
}

/**
 * Direct while you listen: one tap gives the line you just heard that feeling
 * and replays it; the same tap again makes it stronger, a third removes it.
 */
export function MoodBar({ chunkIndex, line, mark, onMore }: MoodBarProps) {
  const t = useTokens();
  const { toast } = useToast();

  const tap = async (emotion: EmotionId) => {
    haptics.tap();
    const before = mark;
    const same = mark?.emotion === emotion && mark.start <= line.start && mark.end >= line.end;
    // Sad → stronger → off
    const next = !same ? { emotion, strong: false } : !mark.strong ? { emotion, strong: true } : null;
    try {
      await applyEmotion(chunkIndex, line, next?.emotion ?? null, { strong: next?.strong, replay: true });
      const meta = emotionMeta[emotion];
      toast.show({
        label: next ? `${meta.emoji} ${next.strong ? `Very ${meta.label.toLowerCase()}` : meta.label}` : 'Back to normal',
        description: next ? (next.strong ? 'Tap again to remove it.' : 'Tap again to make it stronger.') : undefined,
        actionLabel: 'Undo',
        onActionPress: ({ hide }) => {
          hide();
          void applyEmotion(chunkIndex, line, before?.emotion ?? null, { strong: before?.strong, direction: before?.direction, replay: true });
        },
      });
    } catch (e) {
      haptics.error();
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    }
  };

  return (
    <View className="flex-row items-center gap-1" accessibilityRole="toolbar" accessibilityLabel="How the line you just heard should sound">
      {QUICK_EMOTIONS.map((id) => {
        const meta = emotionMeta[id];
        const active = mark?.emotion === id;
        return (
          <Pressable
            key={id}
            onPress={() => void tap(id)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={active ? `${meta.label}${mark?.strong ? ', strong' : ''}. Tap to ${mark?.strong ? 'remove' : 'make it stronger'}` : `Make the last line ${meta.label.toLowerCase()}`}
            className="size-10 items-center justify-center rounded-full active:opacity-60"
            style={active ? { backgroundColor: `${meta.color}${mark?.strong ? '55' : '2e'}` } : undefined}
          >
            <Text className={active ? 'text-[20px]' : 'text-[18px] opacity-70'}>{meta.emoji}</Text>
          </Pressable>
        );
      })}
      <Pressable onPress={onMore} hitSlop={4} accessibilityRole="button" accessibilityLabel="More emotions and sounds" className="size-10 items-center justify-center rounded-full active:bg-default">
        <MoreHorizontal size={19} color={t.muted} />
      </Pressable>
    </View>
  );
}

/** The line a listener means when they react: the one that just finished, early in the next */
export function lineJustHeard(sentences: { start: number; end: number }[], sentenceIndex: number, spokenChars: number) {
  const current = sentences[sentenceIndex];
  const length = current.end - current.start;
  const previous = sentenceIndex > 0 && spokenChars < Math.min(length * 0.25, 30) ? sentences[sentenceIndex - 1] : null;
  return { index: previous ? sentenceIndex - 1 : sentenceIndex, line: { start: (previous ?? current).start, end: (previous ?? current).end } };
}

export { markOf };
