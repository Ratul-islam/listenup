import { Globe, Highlighter, MessageSquareQuote, Send } from 'lucide-react-native';
import { View } from 'react-native';

import { ActionSheet, SheetAction } from '@/components/ui/action-sheet';
import { Text } from '@/components/ui/text';
import type { DescribeTarget } from '@/features/expression/components/describe-sheet';
import { useLineShare } from '@/features/expression/hooks/use-line-share';
import type { Range } from '@/features/expression/lib/marks';
import { quoted } from '@/features/expression/lib/quote';
import type { ReaderChunk } from '@/features/library/types';
import { useTokens } from '@/lib/use-tokens';

import { usePlayerUi, type LineRef } from '../store/player-ui.store';
import { usePlayerStore } from '../store/player.store';

/** The paragraph around a line, within its part */
function paragraphAround(chunk: ReaderChunk, sentenceIndex: number): Range {
  let first = sentenceIndex;
  while (first > 0 && !chunk.sentences[first].paragraphStart) first--;
  let last = sentenceIndex;
  while (last + 1 < chunk.sentences.length && !chunk.sentences[last + 1].paragraphStart) last++;
  return { start: chunk.sentences[first].start, end: chunk.sentences[last].end };
}

interface LineMoreSheetProps {
  line: LineRef | null;
  onClose: () => void;
  onDescribe: (target: DescribeTarget) => void;
}

/** The rest of what a tapped line can do: describe it, choose some of its words, send it, post it */
export function LineMoreSheet({ line, onClose, onDescribe }: LineMoreSheetProps) {
  return (
    <ActionSheet visible={!!line} onClose={onClose} title="This line">
      {line ? <Body line={line} onClose={onClose} onDescribe={onDescribe} /> : null}
    </ActionSheet>
  );
}

function Body({ line, onClose, onDescribe }: LineMoreSheetProps & { line: LineRef }) {
  const t = useTokens();
  const chunk = usePlayerStore((s) => s.chunks[line.chunkIndex]);
  const share = useLineShare(line.chunkIndex);
  const sentence = chunk?.sentences[line.sentenceIndex];
  if (!chunk || !sentence) return null;

  const range = { start: sentence.start, end: sentence.end };
  const paragraph = paragraphAround(chunk, line.sentenceIndex);
  const paragraphIsLonger = paragraph.start !== range.start || paragraph.end !== range.end;

  return (
    <View>
      <View className="mb-1 rounded-2xl bg-surface-secondary px-4 py-3">
        <Text className="text-[15px] leading-[23px]" numberOfLines={3}>{quoted(chunk.text.slice(range.start, range.end))}</Text>
      </View>
      <SheetAction
        icon={<MessageSquareQuote size={18} color={t.accent} />}
        label="Describe how it should sound"
        detail="In your own words, typed or spoken"
        onPress={() => {
          onClose();
          onDescribe({ chunkIndex: line.chunkIndex, ...range, way: 'describe' });
        }}
      />
      <SheetAction
        icon={<Highlighter size={18} color={t.foreground} />}
        label="Choose only some of its words"
        detail="Drag the handles, then give those words a feeling"
        onPress={() => {
          onClose();
          usePlayerUi.getState().selectWords({ ...line, ...range });
        }}
      />
      <SheetAction icon={<Send size={18} color={t.foreground} />} label="Send this line as a voice note" disabled={share.sending} onPress={() => void share.send(range)} />
      {paragraphIsLonger ? (
        <SheetAction icon={<Send size={18} color={t.foreground} />} label="Send its paragraph as a voice note" disabled={share.sending} onPress={() => void share.send(paragraph)} />
      ) : null}
      {share.canPost ? (
        <SheetAction
          icon={<Globe size={18} color={t.foreground} />}
          label="Post this line to Explore"
          detail="As a voice clip others can hear"
          onPress={() => {
            onClose();
            share.post(range);
          }}
        />
      ) : null}
    </View>
  );
}
