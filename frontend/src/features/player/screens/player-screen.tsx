import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Bookmark, BookmarkCheck, ChevronDown, Download, Eraser, MoreHorizontal, ScrollText, Sparkles, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, SheetAction } from '@/components/ui/action-sheet';
import { CloudBackground } from '@/components/ui/cloud-background';
import { IconButton } from '@/components/ui/icon-button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { ExpressionSheet, type ExpressionTarget } from '@/features/expression/components/expression-sheet';
import { useAutoExpression } from '@/features/expression/hooks/use-auto-expression';
import { ExportSheet } from '@/features/exports/components/export-panel';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { playbackApi, type Bookmark as BookmarkItem } from '../api/playback.api';
import { PlayerControls } from '../components/player-controls';
import { Scrubber } from '../components/scrubber';
import { SyncedText } from '../components/synced-text';
import { Transcript, TranscriptToggle } from '../components/transcript';
import { VoiceCard } from '../components/voice-card';
import { VoiceWave } from '../components/voice-wave';
import { audioEngine } from '../engine/audio-engine';
import { formatClock, usePlayerTimeline } from '../hooks/use-player';
import { timeline, usePlayerStore } from '../store/player.store';

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { toast } = useToast();
  const status = usePlayerStore((s) => s.status);
  const document = usePlayerStore((s) => s.document);
  const error = usePlayerStore((s) => s.error);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const { positionMs } = usePlayerTimeline();
  const [view, setView] = useState<'live' | 'transcript'>('live');
  const [menu, setMenu] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<ExpressionTarget | null>(null);
  const [removing, setRemoving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const resumeAfterEdit = useRef(false);
  const auto = useAutoExpression();

  // Hold the line still while choosing; applying replays it in its new voice
  const editLine = (target: ExpressionTarget) => {
    resumeAfterEdit.current = usePlayerStore.getState().isPlaying;
    audioEngine.pause();
    setEditing(target);
  };
  const closeEditor = (applied: boolean) => {
    setEditing(null);
    if (!applied && resumeAfterEdit.current) audioEngine.play();
  };

  // Swipe down on the header to return to the shelf
  const swipeDown = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(20)
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 800) router.back();
    });

  const addBookmark = async () => {
    const { documentId, chunkIndex, positionMs: offsetMs } = usePlayerStore.getState();
    if (!documentId) return;
    try {
      await playbackApi.addBookmark(documentId, { chunkIndex, offsetMs });
      haptics.success();
      setSaved(true);
      toast.show({ label: 'Bookmarked', description: `At ${formatClock(positionMs)}` });
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
      <CloudBackground>
        <View className="flex-1 items-center justify-center gap-4">
          <Spinner size="lg" color={t.accent} />
          <Text variant="caption">Opening…</Text>
        </View>
      </CloudBackground>
    );
  }

  if (status === 'error' || !document) {
    return (
      <CloudBackground>
        <View className="flex-1 justify-center gap-4 px-6">
          <InlineAlert message={error ?? 'Something went wrong.'} />
          <PrimaryButton label="Back to Soundshelf" variant="secondary" onPress={router.back} />
        </View>
      </CloudBackground>
    );
  }

  return (
    <CloudBackground>
      <View className="flex-1 gap-5 px-5" style={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 16 }}>
        <GestureDetector gesture={swipeDown}>
          <View className="gap-3">
            <View className="flex-row items-center">
              <IconButton accessibilityLabel="Close player" onPress={router.back}>
                <ChevronDown size={24} color={t.foreground} />
              </IconButton>
              <View className="flex-1" />
              <IconButton accessibilityLabel="Bookmark this moment" onPress={() => void addBookmark()}>
                {saved ? <BookmarkCheck size={21} color={t.accent} /> : <Bookmark size={21} color={t.foreground} />}
              </IconButton>
              <IconButton accessibilityLabel="More" onPress={() => setMenu(true)}>
                <MoreHorizontal size={21} color={t.foreground} />
              </IconButton>
            </View>

            <View className="items-center gap-1 px-4">
              <Text variant="h2" className="text-center" numberOfLines={2}>{document.title}</Text>
              {document.author ? <Text variant="caption" className="text-center text-[14px]" numberOfLines={1}>{document.author}</Text> : null}
            </View>
          </View>
        </GestureDetector>

        {view === 'live' ? (
          <>
            <VoiceWave active={isPlaying} />
            <SyncedText onOpenTranscript={() => setView('transcript')} onEditLine={editLine} />
          </>
        ) : (
          <>
            <Transcript onEditLine={editLine} />
            <TranscriptToggle onPress={() => setView('live')} />
          </>
        )}

        <InlineAlert message={error} />
        <View className="gap-3">
          <Scrubber />
          <PlayerControls />
          <VoiceCard />
        </View>
      </View>

      <ActionSheet visible={menu} onClose={() => setMenu(false)} title={document.title}>
        <SheetAction
          icon={<ScrollText size={18} color={t.foreground} />}
          label={view === 'live' ? 'Show transcript' : 'Show live text'}
          onPress={() => {
            setView(view === 'live' ? 'transcript' : 'live');
            setMenu(false);
          }}
        />
        <SheetAction icon={<Bookmark size={18} color={t.foreground} />} label="Bookmarks" onPress={() => void openBookmarks()} />
        <SheetAction
          icon={<Download size={18} color={t.foreground} />}
          label="Download MP3"
          onPress={() => {
            setMenu(false);
            setExporting(true);
          }}
        />
        <SheetAction
          icon={auto.running ? <Spinner size="sm" color={t.accent} /> : <Sparkles size={18} color={t.accent} />}
          label={auto.running ? 'Adding emotions…' : 'Make it expressive'}
          detail="AI adds emotions to the lines ahead. Change any of them by holding the line."
          disabled={auto.running || auto.busy}
          onPress={() => {
            setMenu(false);
            void auto.start();
          }}
        />
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

      <ExpressionSheet target={editing} onClose={closeEditor} />
      <ExportSheet document={exporting ? document : null} onClose={() => setExporting(false)} />

      <ActionSheet visible={removing} onClose={() => setRemoving(false)} title="Remove emotions?">
        <Text variant="caption" className="mb-1">Lines go back to normal narration. Parts already playing keep their sound.</Text>
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
    </CloudBackground>
  );
}
