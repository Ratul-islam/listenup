import { router } from 'expo-router';
import { Avatar } from 'heroui-native';
import { ArrowUpDown, Check, Plus } from 'lucide-react-native';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, SheetAction } from '@/components/ui/action-sheet';
import { CloudBackground } from '@/components/ui/cloud-background';
import { IconButton } from '@/components/ui/icon-button';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { ShelfBanner } from '@/features/ads/components/shelf-banner';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { FolderStrip } from '@/features/folders/components/folder-strip';
import { useFolders } from '@/features/folders/hooks/use-folders';
import { useOfflineStore } from '@/features/offline/offline-files';
import { usePlayerStore } from '@/features/player/store/player.store';
import { initials } from '@/features/voices/voice-catalog';
import { ApiError } from '@/lib/api/api-error';
import { usePressScale } from '@/lib/use-press-scale';
import { cardShadow, useTokens } from '@/lib/use-tokens';

import { CategoryChips } from '../components/category-chips';
import { ContinueCard } from '../components/continue-card';
import { DocumentActions } from '../components/document-actions';
import { DocumentRow } from '../components/document-row';
import { SearchBar } from '../components/search-bar';
import { useDocuments } from '../hooks/use-documents';
import { useCardInView, useShelfUi } from '../store/shelf-ui.store';
import type { Category, DocumentSummary, SortOrder } from '../types';

// The Free plan's banner sits after this many items (or after the last, on a shorter shelf)
const BANNER_AFTER = 3;
// Scrolled this far, the Import button folds down to its plus; and the top card counts as out of sight once this little of it is left
const FOLD_IMPORT_AT = 48;
const CARD_PEEK = 56;

const SORTS: { id: SortOrder; label: string }[] = [
  { id: 'recent', label: 'Recently added' },
  { id: 'progress', label: 'Recently played' },
  { id: 'title', label: 'Title' },
];

export default function SoundshelfScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const user = useAuthStore((s) => s.user);
  const hasPlayer = usePlayerStore((s) => !!s.documentId);
  const [category, setCategory] = useState<Category>('all');
  const [sort, setSort] = useState<SortOrder>('recent');
  const [sorting, setSorting] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const [actionsFor, setActionsFor] = useState<DocumentSummary | null>(null);

  // Browsing shows folders plus loose items; searching or filtering looks everywhere
  const browsing = !deferredQuery && category === 'all';
  const { data, isFetching, refetch, isLoading, error } = useDocuments({ category, sort, q: deferredQuery || undefined, folder: browsing ? 'root' : undefined });
  const folders = useFolders();
  const downloads = useOfflineStore((s) => s.downloads);
  // No connection: show what's downloaded, which plays offline
  const offline = !data && error instanceof ApiError && error.isNetworkError;
  const items = data?.items ?? (offline ? Object.values(downloads).map((d) => d.reader.document) : []);
  const shelfEmpty = !!data && data.counts.all === 0 && folders.data?.length === 0;
  const bottomSpace = insets.bottom + (hasPlayer ? 190 : 120);

  // While the top card is in view it is the player here, and the mini player stays away;
  // scrolled past it, the mini player comes back and the Import button moves up to clear it
  const still = useReducedMotion();
  const cardInView = useCardInView();
  const miniShown = hasPlayer && !cardInView;
  const cardBottom = useRef(0);
  const [folded, setFolded] = useState(false);
  const raised = useSharedValue(miniShown ? 1 : 0);
  const wide = useSharedValue(1);
  useEffect(() => {
    raised.set(still ? (miniShown ? 1 : 0) : withTiming(miniShown ? 1 : 0, { duration: 240 }));
  }, [miniShown, raised, still]);
  useEffect(() => {
    wide.set(still ? (folded ? 0 : 1) : withTiming(folded ? 0 : 1, { duration: 200 }));
  }, [folded, wide, still]);
  const importPress = usePressScale(0.93);
  const importPlace = useAnimatedStyle(() => ({ bottom: insets.bottom + 92 + 68 * raised.get() }));
  const importLabel = useAnimatedStyle(() => ({ maxWidth: 70 * wide.get(), opacity: wide.get(), marginLeft: 6 * wide.get() }));

  const header = (
    <View className="gap-[18px] pb-1" style={{ paddingTop: insets.top + 10 }}>
      {/* Search is the top of the page; the account sits beside it */}
      <View className="flex-row items-center gap-2.5 px-5">
        <SearchBar value={query} onChange={setQuery} />
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile" hitSlop={8} className="active:opacity-80">
          <Avatar size="sm" alt={user?.name ?? user?.email ?? 'Account'}>
            {user?.avatarUrl ? <Avatar.Image source={{ uri: user.avatarUrl }} /> : null}
            <Avatar.Fallback>{initials(user?.name ?? user?.email ?? '?')}</Avatar.Fallback>
          </Avatar>
        </Pressable>
      </View>

      {shelfEmpty ? null : (
        <>
          {browsing ? (
            <View
              className="px-5"
              onLayout={(e) => {
                cardBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
              }}
            >
              <ContinueCard />
            </View>
          ) : null}
          {/* Folders and the type filters read as one block of "where to look", closer to each other than to the card above */}
          <View className="gap-2.5">
            {browsing ? <FolderStrip folders={folders.data ?? []} /> : null}
            <View className="flex-row items-center pr-3">
              <View className="flex-1">
                <CategoryChips value={category} onChange={setCategory} />
              </View>
              <IconButton accessibilityLabel={`Sort: ${SORTS.find((s) => s.id === sort)?.label}`} onPress={() => setSorting(true)} size={40}>
                <ArrowUpDown size={17} color={t.muted} />
              </IconButton>
            </View>
          </View>
          {offline ? (
            <Text variant="caption" className="px-5">
              {items.length ? 'You’re offline. These downloads play without a connection.' : 'You’re offline. Downloaded items show up here.'}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );

  return (
    <CloudBackground>
      <FlatList
        data={items}
        keyExtractor={(d) => d.id}
        renderItem={({ item, index }) => (
          <>
            <View className="px-3">
              <DocumentRow document={item} onMore={setActionsFor} />
            </View>
            {!offline && index === Math.min(BANNER_AFTER, items.length) - 1 ? <ShelfBanner /> : null}
          </>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          isLoading || (browsing && folders.data?.length) ? null : shelfEmpty ? (
            <View className="items-center gap-3 px-10 pt-24">
              <Text variant="h2" className="text-center">Your shelf is empty</Text>
              <Text variant="lead" className="text-center">Add a PDF, an article link, a photo of a page or some text, and it will be read aloud.</Text>
              <PrimaryButton label="Add something to hear" className="mt-3" onPress={() => router.push('/import')} />
            </View>
          ) : (
            <View className="items-center gap-1 px-10 py-12">
              <Text variant="title" className="text-center">
                {deferredQuery ? `Nothing matches "${deferredQuery}"` : 'Nothing here yet'}
              </Text>
              <Text variant="caption" className="text-center">{deferredQuery ? 'Try a different word.' : 'Items of this type will show up here.'}</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: bottomSpace }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          useShelfUi.getState().setCardScrolledAway(cardBottom.current > 0 && y > cardBottom.current - CARD_PEEK);
          setFolded(y > FOLD_IMPORT_AT);
        }}
        scrollEventThrottle={32}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => void Promise.all([refetch(), folders.refetch()])}
            tintColor={t.accent}
            colors={[t.accent]}
          />
        }
      />

      {shelfEmpty ? null : (
        <Animated.View className="absolute right-5" style={[importPlace, importPress.style]}>
          <Pressable
            onPress={() => router.push('/import')}
            onPressIn={importPress.onPressIn}
            onPressOut={importPress.onPressOut}
            accessibilityRole="button"
            accessibilityLabel="Import"
            className="h-12 min-w-12 flex-row items-center justify-center rounded-full bg-accent px-3.5"
            style={{ boxShadow: cardShadow }}
          >
            <Plus size={20} color={t.accentForeground} strokeWidth={2.4} />
            {/* Its name folds away once the list is scrolled, leaving the plus */}
            <Animated.View style={[{ overflow: 'hidden' }, importLabel]}>
              <Text className="text-[14.5px] font-semibold text-accent-foreground" numberOfLines={1}>Import</Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      )}

      <ActionSheet visible={sorting} onClose={() => setSorting(false)} title="Sort by">
        {SORTS.map((s) => (
          <SheetAction
            key={s.id}
            icon={s.id === sort ? <Check size={18} color={t.accent} /> : <View />}
            label={s.label}
            onPress={() => {
              setSort(s.id);
              setSorting(false);
            }}
          />
        ))}
      </ActionSheet>

      <DocumentActions document={actionsFor} onClose={() => setActionsFor(null)} />
    </CloudBackground>
  );
}
