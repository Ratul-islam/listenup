import { memo } from 'react';
import { Pressable, View } from 'react-native';

import type { ReaderChunk } from '@/features/library/types';
import { chunkDuration, usePlayerStore } from '@/features/player/store/player.store';
import { useTokens } from '@/lib/use-tokens';

interface ArrangementBarProps {
  documentId: string;
  chunks: ReaderChunk[];
  /** Whether a part's voice is made on the phone (always "voiced", free) */
  isFree: (c: ReaderChunk) => boolean;
  onSelect: (index: number) => void;
}

/**
 * The whole script on one line, like a studio's arrangement view: each part
 * as wide as it is long, filled once it has audio, outlined while it doesn't,
 * with the pauses between parts as gaps. The part playing is the accent.
 */
export const ArrangementBar = memo(function ArrangementBar({ documentId, chunks, isFree, onSelect }: ArrangementBarProps) {
  const t = useTokens();
  const playing = usePlayerStore((s) => (s.documentId === documentId ? s.chunkIndex : -1));
  const total = chunks.reduce((n, c) => n + chunkDuration(c) + (c.pauseAfterMs ?? 0), 0) || 1;

  return (
    <View className="h-9 flex-row items-stretch overflow-hidden rounded-xl bg-surface p-1" accessibilityLabel="The script's parts, as long as they play">
      {chunks.map((c) => {
        const voiced = isFree(c) || c.durationMs != null;
        return (
          <View key={c.index} className="flex-row" style={{ flex: (chunkDuration(c) + (c.pauseAfterMs ?? 0)) / total }}>
            <Pressable
              onPress={() => onSelect(c.index)}
              accessibilityRole="button"
              accessibilityLabel={`Part ${c.index + 1}${voiced ? '' : ', not voiced yet'}`}
              style={{
                flex: chunkDuration(c),
                marginHorizontal: 0.5,
                borderRadius: 4,
                backgroundColor: c.index === playing ? t.accent : voiced ? t.periwinkle : 'transparent',
                borderWidth: voiced ? 0 : 1,
                borderColor: t.periwinkle,
                opacity: c.index === playing || !voiced ? 1 : 0.7,
              }}
            />
            {c.pauseAfterMs ? <View style={{ flex: c.pauseAfterMs }} /> : null}
          </View>
        );
      })}
    </View>
  );
});
