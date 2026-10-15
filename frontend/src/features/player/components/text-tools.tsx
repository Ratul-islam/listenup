import { useToast } from 'heroui-native';
import { Eraser, MessageSquareQuote, MoreHorizontal, X } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { EMOTIONS, emotionMeta, QUICK_EMOTIONS, type EmotionId } from '@/features/expression/catalog';
import { applyEmotion } from '@/features/expression/lib/apply';
import { quoted } from '@/features/expression/lib/quote';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { audioEngine } from '../engine/audio-engine';
import { usePlayerUi, type WordSelection } from '../store/player-ui.store';
import { usePlayerStore } from '../store/player.store';

/**
 * Tools for the words chosen with the handles, in place of the page's usual
 * tools: a feeling in one tap, your own words for it, or every option.
 */
export function WordTools({ onDescribe, onMore }: { onDescribe: (words: WordSelection) => void; onMore: (words: WordSelection) => void }) {
  const t = useTokens();
  const { toast } = useToast();
  const words = usePlayerUi((s) => s.words);
  const text = usePlayerStore((s) => (words ? (s.chunks[words.chunkIndex]?.text.slice(words.start, words.end) ?? '') : ''));
  if (!words) return null;

  const direct = (emotion: EmotionId) => {
    haptics.tap();
    const { chunkIndex, start, end } = words;
    usePlayerUi.getState().reset();
    void applyEmotion(chunkIndex, { start, end }, emotion, { replay: true })
      .then(() => {
        const meta = emotionMeta[emotion];
        // A voice that reads plainly can't play it back; the notice above says what to do
        toast.show({ label: `${meta.emoji} ${meta.label}`, description: audioEngine.takesEmotions(chunkIndex) ? 'Listen to how it sounds now.' : undefined });
      })
      .catch((e) => {
        haptics.error();
        toast.show({ variant: 'danger', label: getErrorMessage(e) });
      });
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text variant="caption" className="flex-1" numberOfLines={1}>
          Drag the handles to choose words: {quoted(text)}
        </Text>
        <Pressable onPress={() => usePlayerUi.getState().selectWords(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel" className="size-9 items-center justify-center rounded-full active:bg-default">
          <X size={17} color={t.muted} />
        </Pressable>
      </View>
      <View className="flex-row items-center gap-1.5">
        {QUICK_EMOTIONS.map((id) => (
          <Pressable
            key={id}
            onPress={() => direct(id)}
            accessibilityRole="button"
            accessibilityLabel={`Make it ${emotionMeta[id].label.toLowerCase()}`}
            className="size-11 items-center justify-center rounded-full bg-surface-secondary active:opacity-60"
          >
            <Text className="text-[19px]">{emotionMeta[id].emoji}</Text>
          </Pressable>
        ))}
        <View className="flex-1" />
        <Pressable onPress={() => onDescribe(words)} accessibilityRole="button" accessibilityLabel="Say how it should sound" className="size-11 items-center justify-center rounded-full bg-accent-soft-bg active:opacity-60">
          <MessageSquareQuote size={18} color={t.accent} />
        </Pressable>
        <Pressable onPress={() => onMore(words)} accessibilityRole="button" accessibilityLabel="More emotions and sounds" className="size-11 items-center justify-center rounded-full bg-surface-secondary active:opacity-60">
          <MoreHorizontal size={18} color={t.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

/** Paint mode's brushes, in place of the page's usual tools: pick a feeling, then tap lines in the text */
export function PaintTools() {
  const t = useTokens();
  const brush = usePlayerUi((s) => s.brush);
  const setBrush = usePlayerUi((s) => s.setBrush);
  const meta = brush === 'erase' ? null : emotionMeta[brush];

  const done = () => {
    usePlayerUi.getState().setPainting(false);
    // What was painted is voiced now, so it's heard from the line being read
    audioEngine.commitEdits();
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text variant="caption" className="flex-1" numberOfLines={2}>
          {meta ? `Tap lines to make them ${meta.label.toLowerCase()}. Tap one again to clear it.` : 'Tap lines to clear their feeling.'}
        </Text>
        <Pressable onPress={done} accessibilityRole="button" accessibilityLabel="Finish painting and hear it" className="min-h-10 justify-center rounded-full bg-accent px-5 active:opacity-80">
          <Text className="text-[14px] font-semibold text-accent-foreground">Done</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerClassName="gap-1.5 px-5">
        <Pressable
          onPress={() => (haptics.tap(), setBrush('erase'))}
          accessibilityRole="radio"
          accessibilityState={{ selected: brush === 'erase' }}
          accessibilityLabel="Eraser"
          className={`size-11 items-center justify-center rounded-full ${brush === 'erase' ? 'bg-accent-soft-bg' : 'bg-surface-secondary'}`}
        >
          <Eraser size={17} color={brush === 'erase' ? t.accent : t.muted} />
        </Pressable>
        {EMOTIONS.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => (haptics.tap(), setBrush(e.id))}
            accessibilityRole="radio"
            accessibilityState={{ selected: brush === e.id }}
            accessibilityLabel={e.label}
            className="size-11 items-center justify-center rounded-full"
            // The brush in hand is ringed as well as darker, so it's told apart without relying on shade
            style={{ backgroundColor: brush === e.id ? `${e.color}55` : `${e.color}1a`, borderWidth: 2, borderColor: brush === e.id ? e.color : 'transparent' }}
          >
            <Text className="text-[19px]">{emotionMeta[e.id].emoji}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
