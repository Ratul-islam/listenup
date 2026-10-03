import { useEffect, useRef } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { Text } from '@/components/ui/text';
import { emotionMeta, soundMeta, tint } from '@/features/expression/catalog';
import type { ExpressionTarget } from '@/features/expression/components/expression-sheet';
import { runsOf } from '@/features/expression/lib/marks';
import type { ReaderChunk } from '@/features/library/types';
import { haptics } from '@/lib/haptics';

import { audioEngine } from '../engine/audio-engine';
import { useSyncPosition } from '../hooks/use-sync-position';
import { chunkDuration, timeline, usePlayerStore } from '../store/player.store';

/**
 * Whole text; the spoken sentence is highlighted, any sentence can be tapped
 * to jump there or held to change how it sounds. Text with an emotion is
 * tinted and starts with its emoji; sounds show as their emoji.
 */
export function Transcript({ onEditLine }: { onEditLine: (target: ExpressionTarget) => void }) {
  const chunks = usePlayerStore((s) => s.chunks);
  const chunkIndex = usePlayerStore((s) => s.chunkIndex);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const { sentenceIndex } = useSyncPosition(chunks[chunkIndex], positionMs);
  const list = useRef<FlatList<ReaderChunk>>(null);

  useEffect(() => {
    if (chunks.length) list.current?.scrollToIndex({ index: chunkIndex, viewPosition: 0.3, animated: true });
  }, [chunkIndex, chunks.length]);

  const jump = (index: number, start: number) => {
    const chunk = chunks[index];
    const { starts } = timeline(chunks);
    void audioEngine.seek(starts[index] + (start / chunk.text.length) * chunkDuration(chunk));
  };

  return (
    <GlassCard raised className="flex-1 overflow-hidden">
      <FlatList
        ref={list}
        data={chunks}
        keyExtractor={(c) => String(c.index)}
        contentContainerClassName="p-5"
        onScrollToIndexFailed={() => {}}
        initialNumToRender={Math.min(chunkIndex + 6, chunks.length)}
        ListHeaderComponent={<Text variant="caption" className="mb-3">Tap a line to jump to it. Hold a line to change how it sounds.</Text>}
        renderItem={({ item }) => (
          <Text className="mb-1 text-[17px] leading-[28px] text-foreground">
            {item.sentences.map((s, i) => {
              const active = item.index === chunkIndex && i === sentenceIndex;
              return (
                <Text
                  key={i}
                  onPress={() => jump(item.index, s.start)}
                  onLongPress={() => {
                    haptics.tap();
                    onEditLine({ chunkIndex: item.index, sentenceIndex: i });
                  }}
                  className={active ? 'font-semibold text-accent' : undefined}
                >
                  {s.paragraphStart && i > 0 ? '\n\n' : ''}
                  {runsOf(item.expressions, s).map((r) => (
                    <Text key={r.start} style={r.emotion ? { backgroundColor: tint(r.emotion) } : undefined}>
                      {r.sound ? `${soundMeta[r.sound].emoji} ` : ''}
                      {r.markStart && r.emotion ? `${emotionMeta[r.emotion].emoji} ` : ''}
                      {item.text.slice(r.start, r.end)}
                    </Text>
                  ))}{' '}
                </Text>
              );
            })}
          </Text>
        )}
        ListFooterComponent={<View className="h-6" />}
      />
    </GlassCard>
  );
}

export function TranscriptToggle({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="self-center rounded-full px-4 py-2 active:bg-default">
      <Text className="text-[14px] font-medium text-muted">Back to the current line</Text>
    </Pressable>
  );
}
