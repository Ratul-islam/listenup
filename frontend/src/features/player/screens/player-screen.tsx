import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Bookmark, BookmarkCheck, ChevronDown, Download, Eraser, MoreHorizontal, Paintbrush, PenLine, Sparkles, Trash2, UsersRound } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, SheetAction } from '@/components/ui/action-sheet';
import { IconButton } from '@/components/ui/icon-button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { CommunityHeart } from '@/features/community/components/community-heart';
import { CastSheet } from '@/features/expression/components/cast-sheet';
import { DescribeSheet, type DescribeTarget } from '@/features/expression/components/describe-sheet';
import { ExpressionSheet, type ExpressionTarget } from '@/features/expression/components/expression-sheet';
import { ExpressiveSheet } from '@/features/expression/components/expressive-sheet';
import { useAutoExpression } from '@/features/expression/hooks/use-auto-expression';
import { ExportSheet } from '@/features/exports/components/export-panel';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';
import { phoneVoice } from '@/modules/phone-voice';

import { playbackApi, type Bookmark as BookmarkItem } from '../api/playback.api';
import { LineMoreSheet } from '../components/line-more-sheet';
import type { LineAction } from '../components/line-tools';
import { PlayerDock } from '../components/player-dock';
import { Transcript } from '../components/transcript';
import { audioEngine } from '../engine/audio-engine';
import { formatClock } from '../hooks/use-player';
import { TEXT_SIZE_LABELS, useTextSize } from '../lib/text-size';
import { toolTarget } from '../lib/tool-target';
import { usePlayerUi, type LineRef, type WordSelection } from '../store/player-ui.store';
import { globalPosition, timeline, usePlayerStore } from '../store/player.store';

/**
 * The player: an open page of text that follows the voice, over one panel
 * with the playback controls and four named tools (the voice, a feeling,
 * saying a line yourself, and making the whole story expressive). Tapping a
 * line opens that line's own tools under it. Everything rarer is under ⋯.
 */
export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { toast } = useToast();
  const status = usePlayerStore((s) => s.status);
  const document = usePlayerStore((s) => s.document);
  const error = usePlayerStore((s) => s.error);
  const errorCode = usePlayerStore((s) => s.errorCode);
  const documentId = usePlayerStore((s) => s.documentId);
  const titleOnPage = usePlayerUi((s) => s.titleOnPage);
  const size = useTextSize((s) => s.size);
  const cycleSize = useTextSize((s) => s.cycle);
  const [menu, setMenu] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<ExpressionTarget | null>(null);
  const [describing, setDescribing] = useState<DescribeTarget | null>(null);
  const [lineMenu, setLineMenu] = useState<LineRef | null>(null);
  const [directing, setDirecting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [casting, setCasting] = useState(false);
  const cast = usePlayerStore((s) => s.cast);
  const resumeAfterEdit = useRef(false);
  const auto = useAutoExpression();

  // A document opens with nothing picked, following the voice; leaving puts it all away
  useEffect(() => {
    usePlayerUi.getState().reset();
    return () => usePlayerUi.getState().reset();
  }, [documentId]);

  // Back first puts away what's open on the page (a line's tools, chosen words, the brushes)
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      const { line, words, painting, reset } = usePlayerUi.getState();
      if (!line && !words && !painting) return false;
      if (painting) audioEngine.commitEdits();
      reset();
      return true;
    });
    return () => back.remove();
  }, []);

  // Hold the line still while choosing; applying replays it in its new voice
  const editLine = (target: ExpressionTarget) => {
    resumeAfterEdit.current = usePlayerStore.getState().isPlaying;
    audioEngine.pause();
    setEditing(target);
  };
  /** A sheet closed: a change replays from that line, so the page goes back to following; otherwise carry on as before */
  const afterSheet = (applied: boolean) => {
    if (applied) usePlayerUi.getState().reset();
    else if (resumeAfterEdit.current) audioEngine.play();
  };
  const closeEditor = (applied: boolean) => {
    setEditing(null);
    afterSheet(applied);
  };
  const describe = (target: DescribeTarget) => {
    if (!editing) {
      resumeAfterEdit.current = usePlayerStore.getState().isPlaying;
      audioEngine.pause();
    }
    setEditing(null);
    setDescribing(target);
  };
  const closeDescribe = (applied: boolean) => {
    setDescribing(null);
    afterSheet(applied);
  };

  /** A tool under a tapped line */
  const onLineAction = (action: Exclude<LineAction, 'play'>, line: LineRef) => {
    const sentence = usePlayerStore.getState().chunks[line.chunkIndex]?.sentences[line.sentenceIndex];
    if (!sentence) return;
    if (action === 'feeling') editLine(line);
    else if (action === 'say') describe({ chunkIndex: line.chunkIndex, start: sentence.start, end: sentence.end, way: 'say' });
    else setLineMenu(line);
  };
  /** "Feeling" and "Say it" under the page: for the tapped line, or the one being heard */
  const feelingForLine = () => {
    const target = toolTarget();
    if (target) editLine({ chunkIndex: target.chunkIndex, sentenceIndex: target.sentenceIndex });
  };
  const sayLine = () => {
    const target = toolTarget();
    if (target) describe({ chunkIndex: target.chunkIndex, start: target.start, end: target.end, way: 'say' });
  };
  /** The words chosen with the handles go to a sheet, which takes over from the handles */
  const describeWords = (words: WordSelection) => {
    describe({ chunkIndex: words.chunkIndex, start: words.start, end: words.end });
    usePlayerUi.getState().selectWords(null);
  };
  const moreForWords = (words: WordSelection) => {
    editLine({ chunkIndex: words.chunkIndex, sentenceIndex: words.sentenceIndex, range: { start: words.start, end: words.end } });
    usePlayerUi.getState().selectWords(null);
  };

  // Swipe down on the header to return to the shelf
  const swipeDown = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(20)
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 800) router.back();
    });

  const addBookmark = async () => {
    const state = usePlayerStore.getState();
    const { documentId, chunkIndex, positionMs: offsetMs } = state;
    if (!documentId) return;
    try {
      await playbackApi.addBookmark(documentId, { chunkIndex, offsetMs });
      haptics.success();
      setSaved(true);
      toast.show({ label: 'Bookmarked', description: `At ${formatClock(globalPosition(state).positionMs)}` });
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    }
  };

  const openBookmarks = async () => {
    setMenu(false);
    const id = usePlayerStore.getState().documentId;
    if (id) setBookmarks(await playbackApi.bookmarks(id).catch(() => []));
  };

  if (status === 'loading' || status === 'idle') {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background">
        <Spinner size="lg" color={t.accent} />
        <Text variant="caption">Opening…</Text>
      </View>
    );
  }

  if (status === 'error' || !document) {
    return (
      <View className="flex-1 justify-center gap-4 bg-background px-6">
        <InlineAlert message={error ?? 'Something went wrong.'} />
        <PrimaryButton label="Back to Soundshelf" variant="secondary" onPress={router.back} />
      </View>
    );
  }

  return (
    // A flat page, so the text can slip under its edges cleanly
    <View className="flex-1 bg-background">
      {/* Close on the left, the page's few settings on the right */}
      <GestureDetector gesture={swipeDown}>
        <View className="flex-row items-center px-2 pb-1" style={{ paddingTop: insets.top + 4 }}>
          <IconButton accessibilityLabel="Close player" onPress={router.back}>
            <ChevronDown size={24} color={t.foreground} />
          </IconButton>
          <View className="flex-1 px-1">
            {/* At the start of the document its title is on the page itself, large; the bar takes over once that's scrolled away */}
            {titleOnPage ? null : (
              <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)}>
                <Text className="text-[15px] font-bold leading-5 tracking-[-0.2px]" numberOfLines={1}>{document.title}</Text>
                {document.author ? <Text variant="caption" numberOfLines={1}>{document.author}</Text> : null}
              </Animated.View>
            )}
            {/* A writing from Explore: heart it from here once you've heard enough */}
            {document.publicationId ? (
              <View className="flex-row">
                <CommunityHeart publicationId={document.publicationId} />
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              haptics.tap();
              cycleSize();
            }}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Text size: ${TEXT_SIZE_LABELS[size]}. Tap to change`}
            className="size-11 items-center justify-center rounded-full active:bg-default"
          >
            <Text className="text-[16px] font-bold">
              A<Text className="text-[12px] font-bold">a</Text>
            </Text>
          </Pressable>
          <IconButton accessibilityLabel="Bookmark this moment" onPress={() => void addBookmark()}>
            {saved ? <BookmarkCheck size={21} color={t.accent} /> : <Bookmark size={21} color={t.foreground} />}
          </IconButton>
          <IconButton accessibilityLabel="More" onPress={() => setMenu(true)}>
            <MoreHorizontal size={21} color={t.foreground} />
          </IconButton>
        </View>
      </GestureDetector>

      <Transcript onLineAction={onLineAction} />

      <PlayerDock
        onFeeling={feelingForLine}
        onSayIt={sayLine}
        onExpressive={() => setDirecting(true)}
        directing={auto.running}
        onCast={() => setCasting(true)}
        onDescribeWords={describeWords}
        onMoreWords={moreForWords}
        alert={
          <InlineAlert
            message={error}
            action={
              errorCode === 'VOICE_MISSING' ? (
                <PrimaryButton
                  label="Download the voice"
                  size="md"
                  variant="secondary"
                  onPress={() => {
                    if (!phoneVoice.openInstallVoiceData()) toast.show({ variant: 'danger', label: "This phone can't download voices." });
                  }}
                />
              ) : undefined
            }
          />
        }
      />

      <ActionSheet visible={menu} onClose={() => setMenu(false)} title={document.title}>
        <SheetAction icon={<Bookmark size={18} color={t.foreground} />} label="Bookmarks" onPress={() => void openBookmarks()} />
        <SheetAction
          icon={<PenLine size={18} color={t.foreground} />}
          label="Edit the script"
          detail="Fix a line or a word; only that part is voiced again"
          onPress={() => {
            setMenu(false);
            router.push({ pathname: '/script/[id]', params: { id: document.id } });
          }}
        />
        <SheetAction
          icon={<Download size={18} color={t.foreground} />}
          label="Download MP3 and subtitles"
          onPress={() => {
            setMenu(false);
            setExporting(true);
          }}
        />
        <SheetAction
          icon={<Paintbrush size={18} color={t.foreground} />}
          label="Paint feelings"
          detail="Give many lines the same feeling, a tap each"
          onPress={() => {
            setMenu(false);
            haptics.tap();
            usePlayerUi.getState().setPainting(true);
          }}
        />
        {cast.length ? (
          <SheetAction
            icon={<UsersRound size={18} color={t.foreground} />}
            label="Character voices"
            detail={`${cast.slice(0, 2).map((c) => c.name).join(', ')}${cast.length > 2 ? ` and ${cast.length - 2} more` : ''}`}
            onPress={() => {
              setMenu(false);
              setCasting(true);
            }}
          />
        ) : null}
        {auto.hasAny ? (
          <SheetAction
            icon={<Eraser size={18} color={t.danger} />}
            label="Remove emotions"
            destructive
            disabled={auto.busy}
            onPress={() => {
              setMenu(false);
              setRemoving(true);
            }}
          />
        ) : null}
      </ActionSheet>

      <ExpressionSheet target={editing} onClose={closeEditor} onDescribe={describe} />
      <DescribeSheet target={describing} onClose={closeDescribe} />
      <LineMoreSheet line={lineMenu} onClose={() => setLineMenu(null)} onDescribe={describe} />
      <ExpressiveSheet visible={directing} onClose={() => setDirecting(false)} />
      <CastSheet visible={casting} onClose={() => setCasting(false)} />
      <ExportSheet document={exporting ? document : null} onClose={() => setExporting(false)} />

      <ActionSheet visible={removing} onClose={() => setRemoving(false)} title="Remove emotions?">
        <Text variant="caption" className="mb-1">Lines go back to normal narration.{cast.length ? ' Characters keep their voices; those are under Character voices.' : ''}</Text>
        {auto.hasAi ? (
          <SheetAction
            icon={<Sparkles size={18} color={t.foreground} />}
            label="Only AI suggestions"
            detail="Keeps the emotions you chose yourself"
            onPress={() => {
              setRemoving(false);
              void auto.clear('ai');
            }}
          />
        ) : null}
        <SheetAction
          icon={<Eraser size={18} color={t.danger} />}
          label="All emotions"
          destructive
          onPress={() => {
            setRemoving(false);
            void auto.clear('all');
          }}
        />
      </ActionSheet>

      <ActionSheet visible={bookmarks !== null} onClose={() => setBookmarks(null)} title="Bookmarks">
        {bookmarks?.length === 0 ? (
          <Text variant="caption" className="py-4">Tap the bookmark button to save a moment.</Text>
        ) : null}
        {bookmarks?.map((b) => {
          const { chunks } = usePlayerStore.getState();
          const at = (timeline(chunks).starts[b.chunkIndex] ?? 0) + b.offsetMs;
          return (
            <View key={b.id} className="flex-row items-center">
              <View className="flex-1">
                <SheetAction
                  icon={<Bookmark size={18} color={t.accent} />}
                  label={formatClock(at)}
                  detail={chunks[b.chunkIndex]?.text.slice(0, 60)}
                  onPress={() => {
                    setBookmarks(null);
                    void audioEngine.seek(at);
                  }}
                />
              </View>
              <IconButton
                accessibilityLabel="Delete bookmark"
                size={40}
                onPress={() => {
                  void playbackApi.removeBookmark(document.id, b.id);
                  setBookmarks((list) => list?.filter((x) => x.id !== b.id) ?? null);
                }}
              >
                <Trash2 size={16} color={t.danger} />
              </IconButton>
            </View>
          );
        })}
      </ActionSheet>
    </View>
  );
}
