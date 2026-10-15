import { LinearGradient } from 'expo-linear-gradient';
import { useToast } from 'heroui-native';
import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { createContext, Fragment, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { FlatList, PixelRatio, Pressable, Text as PlainText, TextInput, View, type GestureResponderEvent, type LayoutChangeEvent, type ViewToken } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  FadeOutDown,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { emotionMeta, soundMeta, tint } from '@/features/expression/catalog';
import { applyEmotion } from '@/features/expression/lib/apply';
import { markOf, runsOf, type Range, type Run } from '@/features/expression/lib/marks';
import type { ReaderChunk } from '@/features/library/types';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { isRtl } from '@/lib/languages';
import { cardShadow, useTokens } from '@/lib/use-tokens';

import { audioEngine } from '../engine/audio-engine';
import { useSpokenSentence, useSpokenWords } from '../hooks/use-sync-position';
import { knownAnchors, spokenPosition } from '../lib/sync';
import { textMetrics, useTextSize } from '../lib/text-size';
import { usePlayerUi, type LineRef, type WordSelection } from '../store/player-ui.store';
import { usePlayerStore } from '../store/player.store';
import { LineTools, type LineAction } from './line-tools';

interface TranscriptProps {
  /** A tool under a tapped line was chosen ("play" is handled here) */
  onLineAction: (action: Exclude<LineAction, 'play'>, line: LineRef) => void;
}

// Where the line being read rests, and where a tapped line is brought to, as a share of the text area's height from its top
const NOW_AT = 0.3;
const PICKED_AT = 0.35;
// A tap lower than this share of the text area brings the line up, so its tools aren't under the controls
const BRING_UP_BELOW = 0.6;
// How much larger the line being read is drawn. Every line is laid out this much narrower than the
// page, so growing one never re-wraps its words: it only gets bigger, into the room kept on its side.
const GROW = 1.22;
// Space above a line, and above a line that opens a paragraph. A growing line grows into these gaps:
// it never pushes the lines around it, so nothing on the page is laid out again while the voice moves.
const LINE_GAP = 17;
const PARAGRAPH_GAP = 32;
const FADE = 28;
// Scrolled further than this, the page's large title is out of sight
const TITLE_GONE_AT = 56;
// The page glides to a new line: slower for a long way, never rushed or sluggish
const GLIDE_MIN_MS = 420;
const GLIDE_MAX_MS = 760;
const GLIDE = Easing.bezier(0.22, 1, 0.36, 1);
const GROW_IN = { duration: 420, easing: Easing.bezier(0.22, 1, 0.36, 1) };
const GROW_OUT = { duration: 300, easing: Easing.out(Easing.quad) };
// The page is built from the part before the one being read (text above the line, so it can rest in
// its place), and these parts are drawn at once: the line is among them, so it's placed on the first layout
const PARTS_BEFORE = 1;
const FIRST_PARTS = 3;
// Scrolled back to the top of what's on the page, the text before it comes in, this many parts at a time.
// They're all drawn before the page is shown again, so everything above the reader has its real height.
const EARLIER_PARTS = 8;
const AT_TOP = 1;
// The page appears once the line is in its place, so it's never seen anywhere else first
const REVEAL = { duration: 160, easing: Easing.out(Easing.quad) };
// A part opened part-way in, whose audio hasn't said yet when its lines are spoken: the page waits this
// long for it before going by an estimate, so it doesn't settle on one line and then move to another
const TIMING_WAIT_MS = 700;
// ...and the page shows after this long whatever happens (a part with nothing to read has no line to place)
const REVEAL_ANYWAY_MS = 1200;

type LayoutCallback = (index: number, sentence: number, y: number) => void;
type LineCallback = (index: number, sentence: number, pageY?: number) => void;

/** The text's colours, worked out once for the page: a line that asks the theme itself makes a long page slow to draw */
interface Ink {
  /** The words spoken so far in the line being read, and a tapped line */
  spoken: string;
  /** The words still to come in that line */
  unspoken: string;
  /** Lines to come, and lines already heard */
  ahead: string;
  heard: string;
  /** The band behind the line being read, and behind a tapped line */
  band: string;
  picked: string;
}

/** The part and line the voice is on, read when asked (not from a render) */
function lineBeingRead(): LineRef {
  const s = usePlayerStore.getState();
  return { chunkIndex: s.chunkIndex, sentenceIndex: spokenPosition(s.chunks[s.chunkIndex], s.playing, s.positionMs).sentenceIndex };
}

/** The emoji a run opens with: a sound made before it, and its feeling where the feeling starts */
const lead = (run: Run) => `${run.sound ? `${soundMeta[run.sound].emoji} ` : ''}${run.markStart && run.emotion ? `${emotionMeta[run.emotion].emoji} ` : ''}`;

/**
 * The whole text as an open page that follows the voice, a line to a sentence.
 * The line being read grows and darkens, word by word, on a soft violet band;
 * the lines around it stay smaller and quieter, and the page glides to keep it
 * in the same place. Tap a line for its tools, right under it. Hold one to
 * choose only some of its words. Scrolling away stops the following until
 * "Now reading" is tapped.
 *
 * The page is built downward from the line being read, not from the top of the
 * document: text that hasn't been drawn has no known height, and any of it
 * above the line would move the line each time some was measured. Earlier
 * text comes in when the listener scrolls back to the top of the page, and a
 * jump far away builds the page again there.
 */
export function Transcript({ onLineAction }: TranscriptProps) {
  const t = useTokens();
  const { toast } = useToast();
  const still = useReducedMotion();
  const chunks = usePlayerStore((s) => s.chunks);
  const chunkIndex = usePlayerStore((s) => s.chunkIndex);
  const title = usePlayerStore((s) => s.document?.title ?? '');
  const author = usePlayerStore((s) => s.document?.author ?? null);
  const sentenceIndex = useSpokenSentence();
  // Where a part is loading, while only an estimate says which line that is; null once the line can be trusted
  // (its audio is in the player, its timing is known ahead, or it's at its start)
  const unsureAt = usePlayerStore((s) => {
    const part = s.chunks[s.chunkIndex];
    return s.playing?.index === s.chunkIndex || s.positionMs === 0 || !part || knownAnchors(part) ? null : `${s.chunkIndex}:${s.positionMs}`;
  });
  const [gaveUpOn, setGaveUpOn] = useState<string | null>(null);
  useEffect(() => {
    if (!unsureAt) return;
    const timer = setTimeout(() => setGaveUpOn(unsureAt), TIMING_WAIT_MS);
    return () => clearTimeout(timer);
  }, [unsureAt]);
  const sure = !unsureAt || gaveUpOn === unsureAt;
  const size = useTextSize((s) => s.size);
  const { fontSize, lineHeight } = textMetrics(size);
  const line = usePlayerUi((s) => s.line);
  const words = usePlayerUi((s) => s.words);
  const painting = usePlayerUi((s) => s.painting);
  const following = usePlayerUi((s) => s.following);
  const list = useAnimatedRef<FlatList<ReaderChunk>>();
  // Which way the line being read is from what's on screen, for the arrow on "Now reading"
  const [nowIsAbove, setNowIsAbove] = useState(false);
  const area = useRef<View>(null);
  const height = useRef(0);
  // Where the page is scrolled to, as it reports it
  const scrolled = useRef(0);
  // Where each part starts on the page, and each line inside its part ("<part>:<line>"), as laid out
  const partTops = useRef(new Map<number, number>());
  const lineTops = useRef(new Map<string, number>());
  const partHeights = useRef(new Map<number, number>());
  const steady = following && !line && !words && !painting;
  // For callbacks that outlive a render (layout, a retried scroll)
  const steadyRef = useRef(steady);
  const sureRef = useRef(sure);
  useEffect(() => {
    steadyRef.current = steady;
    sureRef.current = sure;
  }, [steady, sure]);
  // The first part on the page, how many are drawn at once, and which building of the page this is (a new one starts from nothing)
  const [base, setBase] = useState(() => ({ floor: Math.max(chunkIndex - PARTS_BEFORE, 0), first: FIRST_PARTS, build: 0 }));
  const baseRef = useRef(base);
  // A page built to show earlier text puts a part back where it was on screen, instead of placing the line being read
  const keep = useRef<{ part: number; y: number } | null>(null);
  const parts = useMemo(() => (base.floor ? chunks.slice(base.floor) : chunks), [chunks, base.floor]);
  // This building of the page has had its line put in place, and has been shown
  const placed = useRef(false);
  const revealed = useRef(false);
  const shown = useSharedValue(0);
  const page = useAnimatedStyle(() => ({ opacity: shown.get() }));
  // Started at the document's start, the page shows its own title; further in, the bar above does
  useEffect(() => {
    usePlayerUi.getState().setTitleOnPage(base.floor === 0 && scrolled.current < TITLE_GONE_AT);
  }, [base.floor]);
  useEffect(() => () => usePlayerUi.getState().setTitleOnPage(false), []);
  const ink = useMemo<Ink>(
    () => ({ spoken: t.foreground, unspoken: `${t.foreground}99`, ahead: `${t.foreground}b0`, heard: `${t.muted}c4`, band: `${t.accent}24`, picked: `${t.accent}33` }),
    [t.foreground, t.muted, t.accent],
  );

  // The glide: where the page should be this frame, eased on the UI thread so it never stutters
  const glide = useSharedValue(0);
  const gliding = useSharedValue(false);
  useAnimatedReaction(
    () => glide.get(),
    (y, before) => {
      if (gliding.get() && before !== null && y !== before) scrollTo(list, 0, y, false);
    },
  );
  const stopGlide = useCallback(() => {
    cancelAnimation(glide);
    gliding.set(false);
  }, [glide, gliding]);

  /** Moves the page so a place on it sits at the top of the text area: gliding there, or at once */
  const moveTo = useCallback(
    (y: number, animated: boolean) => {
      const to = Math.max(y, 0);
      const from = scrolled.current;
      if (!animated || still || Math.abs(to - from) < 1) {
        stopGlide();
        return void list.current?.scrollToOffset({ offset: to, animated: false });
      }
      // Already on its way somewhere (the voice moved on again): carry on from there, without a hitch.
      // Otherwise start from where the page is. Either way ease to the place; a longer way takes a little longer.
      if (!gliding.get()) glide.set(from);
      gliding.set(true);
      const duration = Math.min(Math.max(GLIDE_MIN_MS + Math.abs(to - from) * 0.6, GLIDE_MIN_MS), GLIDE_MAX_MS);
      glide.set(
        withTiming(to, { duration, easing: GLIDE }, (finished) => {
          if (finished) gliding.set(false);
        }),
      );
    },
    [glide, gliding, list, still, stopGlide],
  );

  const reveal = useCallback(() => {
    if (revealed.current) return;
    revealed.current = true;
    const { build } = baseRef.current;
    // A frame on, so the page is first seen where it has just been moved to (and not at all if it has been built again since)
    requestAnimationFrame(() => {
      if (build === baseRef.current.build) shown.set(still ? 1 : withTiming(1, REVEAL));
    });
  }, [shown, still]);

  /** Builds the page again from a part: nothing of the old one (its scroll, its sizes) carries over */
  const rebuild = useCallback(
    (floor: number, first: number, held: { part: number; y: number } | null) => {
      stopGlide();
      partTops.current.clear();
      lineTops.current.clear();
      partHeights.current.clear();
      scrolled.current = 0;
      placed.current = false;
      revealed.current = false;
      keep.current = held;
      shown.set(0);
      baseRef.current = { floor, first, build: baseRef.current.build + 1 };
      setBase(baseRef.current);
    },
    [shown, stopGlide],
  );

  /** Builds the page again around a part: for a place too far from what's laid out to scroll to */
  const rebuildAt = useCallback((index: number) => rebuild(Math.max(index - PARTS_BEFORE, 0), FIRST_PARTS, null), [rebuild]);

  /** The text before what's on the page comes in above it, and what was on screen stays where it was */
  const showEarlier = useCallback(() => {
    const { floor } = baseRef.current;
    if (!floor || !placed.current) return;
    const top = partTops.current.get(floor);
    const from = Math.max(floor - EARLIER_PARTS, 0);
    rebuild(from, floor - from + FIRST_PARTS, { part: floor, y: top === undefined ? 0 : top - scrolled.current });
  }, [rebuild]);

  /** Brings a line to a resting place: a share of the text area's height from its top */
  const bringToView = useCallback(
    (target: LineRef, at: number, animated = true) => {
      const chunk = usePlayerStore.getState().chunks[target.chunkIndex];
      if (!chunk || !height.current) return;
      const { floor, first } = baseRef.current;
      const partTop = partTops.current.get(target.chunkIndex);
      const lineTop = lineTops.current.get(`${target.chunkIndex}:${target.sentenceIndex}`);
      if (partTop !== undefined && lineTop !== undefined) {
        // The first time, it's put there before the page is shown: nothing to glide from
        moveTo(partTop + lineTop - height.current * at, animated && placed.current);
        placed.current = true;
        keep.current = null;
        return reveal();
      }
      // The page has just been built around this line: its first layout brings it here
      if (!placed.current && target.chunkIndex >= floor && target.chunkIndex < floor + first) return;
      // Nowhere near what's laid out (a jump elsewhere in the document): build the page there instead of hunting for it
      const beside = partTop !== undefined || partTops.current.has(target.chunkIndex - 1) || partTops.current.has(target.chunkIndex + 1);
      if (target.chunkIndex < floor || !beside) return rebuildAt(target.chunkIndex);
      // The next part along, not laid out yet: let the list find it, about where the line is from how far into its part it starts
      stopGlide();
      const guessed = ((chunk.sentences[target.sentenceIndex]?.start ?? 0) / Math.max(chunk.text.length, 1)) * (partHeights.current.get(target.chunkIndex) ?? 0);
      list.current?.scrollToIndex({ index: target.chunkIndex - floor, viewOffset: height.current * at - (lineTop ?? guessed), animated: animated && !still });
    },
    [list, moveTo, rebuildAt, reveal, still, stopGlide],
  );

  const bringNowToView = useCallback(
    (animated = true) => {
      // Not while the line is only a guess: the page goes there once, when it's known
      if (sureRef.current) bringToView(lineBeingRead(), NOW_AT, animated);
    },
    [bringToView],
  );

  useEffect(() => {
    if (steady && sure) bringNowToView();
  }, [steady, sure, chunkIndex, sentenceIndex, bringNowToView]);

  // A new text size moves every line: while following, the page is built again at the line being read
  const sizeNow = useRef(size);
  useEffect(() => {
    if (sizeNow.current === size) return;
    sizeNow.current = size;
    if (steadyRef.current) rebuildAt(usePlayerStore.getState().chunkIndex);
  }, [size, rebuildAt]);

  // A page that can't place its line still shows
  useEffect(() => {
    const timer = setTimeout(reveal, REVEAL_ANYWAY_MS);
    return () => clearTimeout(timer);
  }, [base.build, reveal]);

  // What a page that has since been built again still reports (a part leaving, a late layout) isn't about this one
  const { build } = base;
  const onLineLayout = useCallback<LayoutCallback>(
    (index, sentence, y) => {
      if (build !== baseRef.current.build) return;
      const key = `${index}:${sentence}`;
      const known = lineTops.current.get(key);
      lineTops.current.set(key, y);
      // The line being read has just been measured, or moved (a line above it changed height): keep it in place
      const now = lineBeingRead();
      if (known !== y && steadyRef.current && index === now.chunkIndex && sentence === now.sentenceIndex) bringNowToView(known !== undefined);
    },
    [bringNowToView, build],
  );
  const onPartLayout = useCallback<PartPlaced>(
    (index, top, partHeight) => {
      if (build !== baseRef.current.build) return;
      // Gone from the page (far from what's on screen): its place is measured again when it's back
      if (top === null) return void partTops.current.delete(index);
      const known = partTops.current.get(index);
      partTops.current.set(index, top);
      partHeights.current.set(index, partHeight);
      // A page built to show earlier text: the part that was at the top goes back where it was, then the page is shown
      const held = keep.current;
      if (held && !placed.current && index === held.part) {
        moveTo(top - held.y, false);
        placed.current = true;
        return reveal();
      }
      if (!steadyRef.current || index !== usePlayerStore.getState().chunkIndex || known === top) return;
      // The part being read has just been placed: the line can be brought to its spot exactly.
      // Or what's above it changed height: back to its spot, unless a glide is already taking it there.
      if (known === undefined || !gliding.get()) bringNowToView(false);
    },
    [bringNowToView, build, gliding, moveTo, reveal],
  );

  /** The listener has scrolled back to the top of what's on the page */
  const atTop = () => !usePlayerUi.getState().following && scrolled.current <= AT_TOP && showEarlier();

  // The list wants the same function for its whole life
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<ReaderChunk>[] }) => {
    const first = viewableItems[0]?.item;
    if (first) setNowIsAbove(usePlayerStore.getState().chunkIndex < first.index);
  }, []);

  const fail = useCallback(
    (e: unknown) => {
      haptics.error();
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    },
    [toast],
  );

  // Rows only redraw when their own text, marks or highlight change, so these read the
  // text when they run and stay the same function while the voice moves
  const onPressLine = useCallback<LineCallback>(
    (index, sentence, pageY) => {
      const ui = usePlayerUi.getState();
      const chunk = usePlayerStore.getState().chunks[index];
      const s = chunk?.sentences[sentence];
      if (!chunk || !s) return;
      haptics.tap();
      if (ui.painting) {
        const range = { start: s.start, end: s.end };
        // Painting a line that already has this feeling clears it
        const emotion = ui.brush === 'erase' || markOf(chunk.expressions, range)?.emotion === ui.brush ? null : ui.brush;
        return void applyEmotion(index, range, emotion).catch(fail);
      }
      // A second tap on the line puts its tools away
      if (ui.line?.chunkIndex === index && ui.line.sentenceIndex === sentence) return ui.selectLine(null);
      ui.selectLine({ chunkIndex: index, sentenceIndex: sentence });
      // Low on the page, the tools would open under the controls: bring the line up
      area.current?.measureInWindow((_x, top, _w, areaHeight) => {
        if (pageY !== undefined && pageY > top + areaHeight * BRING_UP_BELOW) bringToView({ chunkIndex: index, sentenceIndex: sentence }, PICKED_AT);
      });
    },
    [fail, bringToView],
  );
  const onHoldLine = useCallback<LineCallback>((index, sentence) => {
    const s = usePlayerStore.getState().chunks[index]?.sentences[sentence];
    if (!s) return;
    haptics.tap();
    usePlayerUi.getState().selectWords({ chunkIndex: index, sentenceIndex: sentence, start: s.start, end: s.end });
  }, []);

  const onTool = useCallback(
    (action: LineAction, picked: LineRef) => {
      if (action !== 'play') return onLineAction(action, picked);
      const start = usePlayerStore.getState().chunks[picked.chunkIndex]?.sentences[picked.sentenceIndex]?.start;
      if (start === undefined) return;
      // Hearing it from here is also coming back to the voice
      usePlayerUi.getState().reset();
      void audioEngine.seekToLine(picked.chunkIndex, start);
    },
    [onLineAction],
  );

  return (
    <View
      ref={area}
      className="flex-1"
      onLayout={(e) => {
        height.current = e.nativeEvent.layout.height;
        // The line may have been measured before the area was: place it now that both are known
        if (steadyRef.current) bringNowToView(false);
      }}
    >
      <PartPlacedContext value={onPartLayout}>
        <Animated.View className="flex-1" style={page}>
          <FlatList
            // A new building of the page starts from nothing: no leftover scroll or sizes
            key={base.build}
            ref={list}
            data={parts}
            keyExtractor={(c) => String(c.index)}
            contentContainerClassName="px-6"
            CellRendererComponent={PartCell}
            initialNumToRender={base.first}
            // A part is a screenful of lines: a few at a time, near what's on screen, keeps each step short
            maxToRenderPerBatch={2}
            windowSize={5}
            // The line being read is drawn a little past its own edges; nothing may be cut off there
            removeClippedSubviews={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => {
              // A finger on the page takes over from the glide
              stopGlide();
              usePlayerUi.getState().setFollowing(false);
            }}
            onScroll={(e) => {
              if (build !== baseRef.current.build) return;
              const y = e.nativeEvent.contentOffset.y;
              const goingUp = y < scrolled.current;
              scrolled.current = y;
              usePlayerUi.getState().setTitleOnPage(base.floor === 0 && y < TITLE_GONE_AT);
              if (goingUp) atTop();
            }}
            // Already at the top and pulled again: nothing scrolls, but the pull says the same thing
            onScrollEndDrag={atTop}
            onMomentumScrollEnd={atTop}
            scrollEventThrottle={16}
            onViewableItemsChanged={onViewable}
            // A part that isn't laid out yet: go near it, then to it once it's there
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              list.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
              setTimeout(() => steadyRef.current && bringNowToView(false), 120);
            }}
            extraData={`${line?.chunkIndex}:${line?.sentenceIndex}:${words?.chunkIndex}:${chunkIndex}:${sentenceIndex}:${size}`}
            renderItem={({ item }) =>
              words?.chunkIndex === item.index ? (
                <SelectableChunk chunk={item} selection={words} fontSize={fontSize} lineHeight={lineHeight} />
              ) : (
                <Part
                  chunk={item}
                  now={item.index === chunkIndex ? sentenceIndex : -1}
                  heard={item.index < chunkIndex}
                  picked={line?.chunkIndex === item.index ? line.sentenceIndex : -1}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  ink={ink}
                  onPressLine={onPressLine}
                  onHoldLine={onHoldLine}
                  onLineLayout={onLineLayout}
                  onTool={onTool}
                />
              )
            }
            // At the document's start the page opens like a book's: its title, then the text
            ListHeaderComponent={
              base.floor === 0 ? (
                <View className="gap-1" style={{ paddingTop: FADE + 4 }}>
                  <Text className="text-[26px] font-extrabold leading-8 tracking-[-0.6px]" accessibilityRole="header">{title}</Text>
                  {author ? <Text className="text-[15px] font-medium text-muted">{author}</Text> : null}
                </View>
              ) : (
                // Part-way into the document: the text before this comes in on reaching the top, or with a tap here
                <Pressable onPress={showEarlier} accessibilityRole="button" accessibilityLabel="Show earlier text" className="h-14 flex-row items-center justify-center gap-1.5 active:opacity-60" style={{ marginTop: FADE - 12 }}>
                  <ArrowUp size={14} color={t.muted} strokeWidth={2.2} />
                  <Text className="text-[13px] font-semibold text-muted">Earlier text</Text>
                </Pressable>
              )
            }
            // Room under the last line, so it can still rise to where the line being read rests
            ListFooterComponent={<View className="h-80" />}
          />
        </Animated.View>
      </PartPlacedContext>
      {/* The text slips under the edges instead of being cut by them */}
      <LinearGradient pointerEvents="none" colors={[t.background, `${t.background}00`]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: FADE }} />
      <LinearGradient pointerEvents="none" colors={[`${t.background}00`, t.background]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: FADE }} />

      {following || words || painting ? null : (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(160)} className="absolute inset-x-0 bottom-3 items-center" pointerEvents="box-none">
          <Pressable
            onPress={() => {
              haptics.tap();
              usePlayerUi.getState().reset();
            }}
            accessibilityRole="button"
            accessibilityLabel="Back to the line being read"
            className="h-11 flex-row items-center gap-1.5 rounded-full bg-accent pl-3.5 pr-4 active:opacity-85"
            style={{ boxShadow: cardShadow }}
          >
            {nowIsAbove ? <ArrowUp size={16} color={t.accentForeground} strokeWidth={2.4} /> : <ArrowDown size={16} color={t.accentForeground} strokeWidth={2.4} />}
            <Text className="text-[14px] font-semibold text-accent-foreground">Now reading</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

type PartPlaced = (index: number, top: number | null, height: number) => void;
/** Where a part's cell says it sits on the page */
const PartPlacedContext = createContext<PartPlaced>(() => {});

/**
 * The list's cell for a part: an ordinary cell that also says where it sits on
 * the page (and when it has gone from it), which is what lets the page glide to
 * a line by itself instead of jumping there.
 */
function PartCell({ item, onLayout, ...rest }: ComponentProps<typeof View> & { item: ReaderChunk }) {
  const placed = useContext(PartPlacedContext);
  // The part's own number: the list may start part-way into the document
  const index = item.index;
  useEffect(() => () => placed(index, null, 0), [index, placed]);
  return (
    <View
      {...rest}
      onLayout={(e: LayoutChangeEvent) => {
        placed(index, e.nativeEvent.layout.y, e.nativeEvent.layout.height);
        onLayout?.(e);
      }}
    />
  );
}

interface PartProps {
  chunk: ReaderChunk;
  /** The sentence being read, or -1 when it's in another part */
  now: number;
  /** The voice is past this part */
  heard: boolean;
  /** The tapped sentence, or -1 */
  picked: number;
  fontSize: number;
  lineHeight: number;
  ink: Ink;
  onPressLine: LineCallback;
  onHoldLine: LineCallback;
  onLineLayout: LayoutCallback;
  onTool: (action: LineAction, line: LineRef) => void;
}

/**
 * One part of the document, a line to a sentence, with the tapped line's tools
 * right under it. A part redraws when the voice enters, leaves or moves to
 * another sentence in it, not on every word.
 */
const Part = memo(function Part({ chunk, now, heard, picked, fontSize, lineHeight, ink, onPressLine, onHoldLine, onLineLayout, onTool }: PartProps) {
  const feeling = picked >= 0 && chunk.sentences[picked] ? markOf(chunk.expressions, chunk.sentences[picked])?.emotion : undefined;
  return (
    <View>
      {chunk.sentences.map((sentence, i) => (
        <Fragment key={i}>
          <Line
            chunk={chunk}
            index={i}
            state={i === now ? 'now' : heard || (now >= 0 && i < now) ? 'heard' : 'ahead'}
            picked={i === picked}
            fontSize={fontSize}
            lineHeight={lineHeight}
            ink={ink}
            onPressLine={onPressLine}
            onHoldLine={onHoldLine}
            onLineLayout={onLineLayout}
          />
          {i === picked ? <LineTools feeling={feeling} onAction={(action) => onTool(action, { chunkIndex: chunk.index, sentenceIndex: i })} /> : null}
        </Fragment>
      ))}
    </View>
  );
});

interface LineProps {
  chunk: ReaderChunk;
  index: number;
  /** Being read now, already heard, or still to come */
  state: 'now' | 'heard' | 'ahead';
  picked: boolean;
  fontSize: number;
  lineHeight: number;
  ink: Ink;
  onPressLine: LineCallback;
  onHoldLine: LineCallback;
  onLineLayout: LayoutCallback;
}

/**
 * One sentence. It's laid out a little narrower than the page, so that when it
 * becomes the line being read it can simply grow (from its start, into the room
 * on its side) without a word changing lines; a violet band fades in behind it.
 * Only a line the voice has reached is set up to move. The rest are plain
 * views, which is what keeps a page of them quick to draw.
 */
const Line = memo(function Line({ chunk, index, state, picked, fontSize, lineHeight, ink, onPressLine, onHoldLine, onLineLayout }: LineProps) {
  const sentence = chunk.sentences[index];
  const rtl = isRtl(chunk.language);
  const now = state === 'now';
  // Lit from the start when the page opens on it; a line the voice arrives at grows into it
  const [startsLit] = useState(now);
  const [reached, setReached] = useState(now);
  if (now && !reached) setReached(true);

  const words = (
    <>
      {picked ? <View pointerEvents="none" style={[BAND, { backgroundColor: ink.picked }]} /> : null}
      <PlainText
        className={`font-sans ${rtl ? 'text-right' : ''}`}
        // Only the line being read is at full strength: lines to come are softer, lines heard softer still
        style={{ fontSize, lineHeight, color: picked ? ink.spoken : state === 'heard' ? ink.heard : ink.ahead }}
      >
        {now ? (
          <NowRuns chunk={chunk} sentence={sentence} ink={ink} />
        ) : (
          runsOf(chunk.expressions, sentence).map((run) => (
            <PlainText key={run.start} style={run.emotion ? { backgroundColor: tint(run.emotion) } : undefined}>
              {lead(run)}
              {chunk.text.slice(run.start, run.end)}
            </PlainText>
          ))
        )}
      </PlainText>
    </>
  );

  return (
    <Pressable
      onPress={(e: GestureResponderEvent) => onPressLine(chunk.index, index, e.nativeEvent.pageY)}
      onLongPress={() => onHoldLine(chunk.index, index)}
      onLayout={(e) => onLineLayout(chunk.index, index, e.nativeEvent.layout.y)}
      accessibilityRole="button"
      accessibilityState={{ selected: now }}
      accessibilityHint="Opens this line's tools. Hold to choose words."
      style={{ marginTop: sentence.paragraphStart ? PARAGRAPH_GAP : LINE_GAP }}
    >
      {reached ? (
        <LitBox now={now} startsLit={startsLit} rtl={rtl} band={ink.band}>
          {words}
        </LitBox>
      ) : (
        <View style={rtl ? BOX_RTL : BOX}>{words}</View>
      )}
    </Pressable>
  );
});

// Narrower than the page by as much as the line being read grows
const BOX = { width: `${100 / GROW}%`, alignSelf: 'flex-start', transformOrigin: 'left center' } as const;
const BOX_RTL = { width: `${100 / GROW}%`, alignSelf: 'flex-end', transformOrigin: 'right center' } as const;
const BAND = { position: 'absolute', left: -8, right: -8, top: -4, bottom: -4, borderRadius: 12 } as const;

interface LitBoxProps {
  now: boolean;
  startsLit: boolean;
  rtl: boolean;
  band: string;
  children: ReactNode;
}

/**
 * The box of a line the voice has reached: it grows while it's read, on its
 * band, and settles back after. Only its size on screen and the band change,
 * never its place in the page, so the phone draws it without laying anything out.
 */
function LitBox({ now, startsLit, rtl, band, children }: LitBoxProps) {
  const still = useReducedMotion();
  /** 0 at rest, 1 when it's the line being read */
  const lit = useSharedValue(startsLit ? 1 : 0);
  useEffect(() => {
    lit.set(still ? (now ? 1 : 0) : withTiming(now ? 1 : 0, now ? GROW_IN : GROW_OUT));
  }, [now, lit, still]);

  const grow = useAnimatedStyle(() => ({ transform: [{ scale: 1 + (GROW - 1) * lit.get() }] }));
  const glow = useAnimatedStyle(() => ({ opacity: lit.get() }));

  return (
    <Animated.View style={[rtl ? BOX_RTL : BOX, grow]}>
      {/* Behind the words, a little wider than them: violet while it's read */}
      <Animated.View pointerEvents="none" style={[BAND, { backgroundColor: band }, glow]} />
      {children}
    </Animated.View>
  );
}

/**
 * The words of the line being read: those already spoken dark, the rest still
 * light. The only thing here that redraws on every word.
 */
function NowRuns({ chunk, sentence, ink }: { chunk: ReaderChunk; sentence: Range; ink: Ink }) {
  const { spoken } = useSpokenWords();
  const cut = sentence.start + spoken;
  return runsOf(chunk.expressions, sentence).flatMap((run) => {
    // Each run is split where the voice is, so a marked phrase keeps its tint on both sides
    const at = Math.min(Math.max(cut, run.start), run.end);
    const tinted = run.emotion ? { backgroundColor: tint(run.emotion) } : undefined;
    return [
      at > run.start ? (
        <PlainText key={`${run.start}s`} style={[{ color: ink.spoken }, tinted]}>
          {lead(run)}
          {chunk.text.slice(run.start, at)}
        </PlainText>
      ) : null,
      at < run.end ? (
        // The words still to come in this line, no stronger than the lines after it
        <PlainText key={`${run.start}u`} style={[{ color: ink.unspoken }, tinted]}>
          {at > run.start ? '' : lead(run)}
          {chunk.text.slice(at, run.end)}
        </PlainText>
      ) : null,
    ];
  });
}

/**
 * One part as selectable text: the held line starts selected, and the
 * system's handles change the selection. It can't be edited.
 */
function SelectableChunk({ chunk, selection, fontSize, lineHeight }: { chunk: ReaderChunk; selection: WordSelection; fontSize: number; lineHeight: number }) {
  const t = useTokens();
  const fontScale = Math.min(PixelRatio.getFontScale(), 1.6);
  // Selected once from the held line; after that the handles are in charge
  const [initial, setInitial] = useState<Range | undefined>({ start: selection.start, end: selection.end });
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
        if (s.end > s.start) usePlayerUi.getState().selectWords({ ...selection, start: s.start, end: s.end });
      }}
      underlineColorAndroid="transparent"
      // No spell-check or suggestion underlines on someone else's text
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      importantForAutofill="no"
      // Inputs don't follow the phone's font size like Text does, so size it by hand to match the page
      allowFontScaling={false}
      accessibilityLabel="Choose the words to direct"
      className={`font-sans text-foreground ${isRtl(chunk.language) ? 'text-right' : ''}`}
      style={{ fontSize: fontSize * fontScale, lineHeight: lineHeight * fontScale, marginTop: PARAGRAPH_GAP, width: `${100 / GROW}%`, padding: 0, includeFontPadding: false, textAlignVertical: 'top' }}
    />
  );
}
