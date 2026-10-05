import { useToast } from 'heroui-native';
import { Eraser, MessageSquareQuote, MoreHorizontal, Paintbrush, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { FlatList, PixelRatio, Pressable, ScrollView, TextInput, View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { Text } from '@/components/ui/text';
import { EMOTIONS, emotionMeta, QUICK_EMOTIONS, soundMeta, tint, type EmotionId } from '@/features/expression/catalog';
import type { DescribeTarget } from '@/features/expression/components/describe-sheet';
import type { ExpressionTarget } from '@/features/expression/components/expression-sheet';
import { applyEmotion } from '@/features/expression/lib/apply';
import { markOf, runsOf, type Range } from '@/features/expression/lib/marks';
import type { ReaderChunk } from '@/features/library/types';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { isRtl } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import { audioEngine } from '../engine/audio-engine';
import { useSyncPosition } from '../hooks/use-sync-position';
import { chunkDuration, timeline, usePlayerStore } from '../store/player.store';

interface Selection extends Range {
  chunkIndex: number;
  sentenceIndex: number;
}

interface TranscriptProps {
  onEditLine: (target: ExpressionTarget) => void;
  onDescribe: (target: DescribeTarget) => void;
}

/**
 * Whole text; the spoken sentence is highlighted. Tap a line to jump there.
 * Hold a line to select it like any text (drag the handles for more or fewer
 * words) and give it a feeling from the toolbar. Paint mode gives many lines
 * the same feeling, one tap each.
 */
export function Transcript({ onEditLine, onDescribe }: TranscriptProps) {
  const t = useTokens();
  const { toast } = useToast();
  const chunks = usePlayerStore((s) => s.chunks);
  const chunkIndex = usePlayerStore((s) => s.chunkIndex);
  const positionMs = usePlayerStore((s) => s.positionMs);
  const { sentenceIndex } = useSyncPosition(chunks[chunkIndex], positionMs);
  const list = useRef<FlatList<ReaderChunk>>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  // Paint mode: the emotion being painted, or "erase"
  const [brush, setBrush] = useState<EmotionId | 'erase' | null>(null);

  useEffect(() => {
    if (chunks.length && !selection && !brush) list.current?.scrollToIndex({ index: chunkIndex, viewPosition: 0.3, animated: true });
  }, [chunkIndex, chunks.length, selection, brush]);

  const fail = (e: unknown) => {
    haptics.error();
    toast.show({ variant: 'danger', label: getErrorMessage(e) });
  };

  const jump = (index: number, start: number) => {
    const chunk = chunks[index];
    const { starts } = timeline(chunks);
    void audioEngine.seek(starts[index] + (start / chunk.text.length) * chunkDuration(chunk));
  };

  const select = (index: number, i: number) => {
    haptics.tap();
    const s = chunks[index].sentences[i];
    setBrush(null);
    setSelection({ chunkIndex: index, sentenceIndex: i, start: s.start, end: s.end });
  };

  const paint = (index: number, i: number) => {
    if (!brush) return;
    const chunk = chunks[index];
    const s = chunk.sentences[i];
    const line = { start: s.start, end: s.end };
    const current = markOf(chunk.expressions, line);
    // Painting a line that already has this feeling clears it
    const emotion = brush === 'erase' || current?.emotion === brush ? null : brush;
    haptics.tap();
    void applyEmotion(index, line, emotion).catch(fail);
  };

  const direct = (emotion: EmotionId) => {
    if (!selection) return;
    haptics.tap();
    const { chunkIndex: index, start, end } = selection;
    setSelection(null);
    void applyEmotion(index, { start, end }, emotion, { replay: true })
      .then(() => toast.show({ label: `${emotionMeta[emotion].emoji} ${emotionMeta[emotion].label}`, description: 'Listen to how it sounds now.' }))
      .catch(fail);
  };

  return (
    <GlassCard raised className="flex-1 overflow-hidden">
      {selection ? (
        <SelectionToolbar
          text={chunks[selection.chunkIndex].text.slice(selection.start, selection.end)}
          onEmotion={direct}
          onDescribe={() => {
            onDescribe(selection);
            setSelection(null);
          }}
          onMore={() => {
            onEditLine({ chunkIndex: selection.chunkIndex, sentenceIndex: selection.sentenceIndex, range: { start: selection.start, end: selection.end } });
            setSelection(null);
          }}
          onClose={() => setSelection(null)}
        />
      ) : brush ? (
        <PaintPalette brush={brush} onBrush={setBrush} onDone={() => setBrush(null)} />
      ) : (
        <View className="flex-row items-center gap-2 px-5 pb-1 pt-4">
          <Text variant="caption" className="flex-1">Tap a line to jump to it. Hold a line to choose how it sounds.</Text>
          <Pressable
            onPress={() => {
              haptics.tap();
              setBrush('scared');
            }}
            accessibilityRole="button"
            accessibilityLabel="Paint emotions on many lines"
            className="flex-row items-center gap-1.5 rounded-full bg-surface-secondary px-3 py-1.5 active:opacity-70"
          >
            <Paintbrush size={15} color={t.accent} />
            <Text className="text-[13px] font-semibold text-accent">Paint</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        ref={list}
        data={chunks}
        keyExtractor={(c) => String(c.index)}
        contentContainerClassName="px-5 pb-5 pt-3"
        onScrollToIndexFailed={() => {}}
        initialNumToRender={Math.min(chunkIndex + 6, chunks.length)}
        keyboardShouldPersistTaps="handled"
        extraData={`${selection?.chunkIndex}:${brush}`}
        renderItem={({ item }) =>
          selection?.chunkIndex === item.index ? (
            <SelectableChunk chunk={item} selection={selection} onChange={(range) => setSelection({ ...selection, ...range })} />
          ) : (
            <Text className={`mb-1 text-[17px] leading-[28px] text-foreground ${isRtl(item.language) ? 'text-right' : ''}`}>
              {item.sentences.map((s, i) => {
                const active = item.index === chunkIndex && i === sentenceIndex;
                return (
                  <Text
                    key={i}
                    onPress={() => (brush ? paint(item.index, i) : jump(item.index, s.start))}
                    onLongPress={() => select(item.index, i)}
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
          )
        }
        ListFooterComponent={<View className="h-6" />}
      />
    </GlassCard>
  );
}

/**
 * One chunk as selectable text: the held line starts selected, and the
 * system's handles change the selection. It can't be edited.
 */
function SelectableChunk({ chunk, selection, onChange }: { chunk: ReaderChunk; selection: Selection; onChange: (range: Range) => void }) {
  const t = useTokens();
  const fontScale = Math.min(PixelRatio.getFontScale(), 1.6);
  // Selected once from the held line; after that the handles are in charge
  const [initial, setInitial] = useState<{ start: number; end: number } | undefined>({ start: selection.start, end: selection.end });
  return (
    <TextInput
      value={chunk.text}
      onChangeText={() => {}}
      multiline
      scrollEnabled={false}
      autoFocus
      showSoftInputOnFocus={false}
      contextMenuHidden
      caretHidden
      selection={initial}
      selectionColor={`${t.accent}55`}
      onSelectionChange={({ nativeEvent: { selection: s } }) => {
        if (initial && (s.start !== initial.start || s.end !== initial.end)) setInitial(undefined);
        if (s.end > s.start) onChange({ start: s.start, end: s.end });
      }}
      underlineColorAndroid="transparent"
      // No spell-check or suggestion underlines on someone else's text
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      importantForAutofill="no"
      // Inputs don't follow the phone's font size like Text does, so size it by hand to match (natural line spacing, like the transcript)
      allowFontScaling={false}
      accessibilityLabel="Choose the words to direct"
      className={`mb-1 rounded-xl bg-accent-soft-bg/40 p-0 font-sans text-foreground ${isRtl(chunk.language) ? 'text-right' : ''}`}
      style={{ fontSize: 17 * fontScale, paddingTop: 0, paddingBottom: 0, includeFontPadding: false, textAlignVertical: 'top' }}
    />
  );
}

function SelectionToolbar({
  text,
  onEmotion,
  onDescribe,
  onMore,
  onClose,
}: {
  text: string;
  onEmotion: (emotion: EmotionId) => void;
  onDescribe: () => void;
  onMore: () => void;
  onClose: () => void;
}) {
  const t = useTokens();
  return (
    <View className="gap-2 border-b border-border px-4 pb-3 pt-3">
      <View className="flex-row items-center gap-2">
        <Text variant="caption" className="flex-1" numberOfLines={1}>
          Drag the handles to choose words · “{text.trim()}”
        </Text>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel" className="size-8 items-center justify-center rounded-full active:bg-default">
          <X size={17} color={t.muted} />
        </Pressable>
      </View>
      <View className="flex-row items-center gap-1">
        {QUICK_EMOTIONS.map((id) => (
          <Pressable
            key={id}
            onPress={() => onEmotion(id)}
            accessibilityRole="button"
            accessibilityLabel={`Make it ${emotionMeta[id].label.toLowerCase()}`}
            className="size-10 items-center justify-center rounded-full bg-surface-secondary active:opacity-60"
          >
            <Text className="text-[19px]">{emotionMeta[id].emoji}</Text>
          </Pressable>
        ))}
        <View className="flex-1" />
        <Pressable onPress={onDescribe} accessibilityRole="button" accessibilityLabel="Say how it should sound" className="size-10 items-center justify-center rounded-full bg-surface-secondary active:opacity-60">
          <MessageSquareQuote size={18} color={t.accent} />
        </Pressable>
        <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel="More emotions and sounds" className="size-10 items-center justify-center rounded-full bg-surface-secondary active:opacity-60">
          <MoreHorizontal size={18} color={t.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

function PaintPalette({ brush, onBrush, onDone }: { brush: EmotionId | 'erase'; onBrush: (b: EmotionId | 'erase') => void; onDone: () => void }) {
  const t = useTokens();
  const meta = brush === 'erase' ? null : emotionMeta[brush];
  return (
    <View className="gap-2 border-b border-border pb-3 pt-3">
      <View className="flex-row items-center gap-2 px-4">
        <Text variant="caption" className="flex-1" numberOfLines={1}>
          {meta ? `Tap lines to make them ${meta.label.toLowerCase()}. Tap again to clear.` : 'Tap lines to clear their emotion.'}
        </Text>
        <Pressable onPress={onDone} accessibilityRole="button" className="rounded-full bg-accent px-3.5 py-1.5 active:opacity-80">
          <Text className="text-[13px] font-semibold text-accent-foreground">Done</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-4">
        <Pressable
          onPress={() => (haptics.tap(), onBrush('erase'))}
          accessibilityRole="radio"
          accessibilityState={{ selected: brush === 'erase' }}
          accessibilityLabel="Eraser"
          className={`size-10 items-center justify-center rounded-full ${brush === 'erase' ? 'bg-accent-soft-bg' : 'bg-surface-secondary'}`}
        >
          <Eraser size={17} color={brush === 'erase' ? t.accent : t.muted} />
        </Pressable>
        {EMOTIONS.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => (haptics.tap(), onBrush(e.id))}
            accessibilityRole="radio"
            accessibilityState={{ selected: brush === e.id }}
            accessibilityLabel={e.label}
            className="size-10 items-center justify-center rounded-full"
            style={{ backgroundColor: brush === e.id ? `${e.color}55` : `${e.color}1a` }}
          >
            <Text className="text-[19px]">{e.emoji}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function TranscriptToggle({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="self-center rounded-full px-4 py-2 active:bg-default">
      <Text className="text-[14px] font-medium text-muted">Back to the current line</Text>
    </Pressable>
  );
}
