import { router } from 'expo-router';
import { Avatar } from 'heroui-native';
import { ArrowUpDown, Check, Plus } from 'lucide-react-native';
import { useDeferredValue, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, SheetAction } from '@/components/ui/action-sheet';
import { CloudBackground } from '@/components/ui/cloud-background';
import { IconButton } from '@/components/ui/icon-button';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { FolderStrip } from '@/features/folders/components/folder-strip';
import { useFolders } from '@/features/folders/hooks/use-folders';
import { usePlayerStore } from '@/features/player/store/player.store';
import { initials } from '@/features/voices/voice-catalog';
import { cardShadow, useTokens } from '@/lib/use-tokens';

import { CategoryChips } from '../components/category-chips';
import { ContinueCard } from '../components/continue-card';
import { DocumentActions } from '../components/document-actions';
import { DocumentRow } from '../components/document-row';
import { SearchBar } from '../components/search-bar';
import { useDocuments } from '../hooks/use-documents';
import type { Category, DocumentSummary, SortOrder } from '../types';

const SORTS: { id: SortOrder; label: string }[] = [
  { id: 'recent', label: 'Recently added' },
  { id: 'progress', label: 'Recently played' },
  { id: 'title', label: 'Title' },
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

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
  const { data, isFetching, refetch, isLoading } = useDocuments({ category, sort, q: deferredQuery || undefined, folder: browsing ? 'root' : undefined });
  const folders = useFolders();
  const items = data?.items ?? [];
  const shelfEmpty = !!data && data.counts.all === 0 && folders.data?.length === 0;
  const bottomSpace = insets.bottom + (hasPlayer ? 190 : 120);

  const header = (
    <View className="gap-6 pb-2">
      <View className="flex-row items-center justify-between px-5" style={{ paddingTop: insets.top + 16 }}>
        <View className="gap-0.5">
          <Text variant="caption" className="text-[14px]">{`${greeting()}${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}</Text>
          <Text variant="h1" accessibilityRole="header">Soundshelf</Text>
        </View>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile" hitSlop={6}>
          <Avatar size="md" alt={user?.name ?? user?.email ?? 'Account'}>
            {user?.avatarUrl ? <Avatar.Image source={{ uri: user.avatarUrl }} /> : null}
            <Avatar.Fallback>{initials(user?.name ?? user?.email ?? '?')}</Avatar.Fallback>
          </Avatar>
        </Pressable>
      </View>

      {shelfEmpty ? null : (
        <>
          <View className="px-5">
            <ContinueCard />
          </View>
          <View className="gap-3">
            <View className="flex-row items-center gap-2 px-5">
              <SearchBar value={query} onChange={setQuery} />
              <IconButton accessibilityLabel={`Sort: ${SORTS.find((s) => s.id === sort)?.label}`} onPress={() => setSorting(true)} size={48}>
                <ArrowUpDown size={19} color={t.foreground} />
              </IconButton>
            </View>
            <CategoryChips value={category} onChange={setCategory} />
          </View>
          {browsing ? <FolderStrip folders={folders.data ?? []} /> : null}
        </>
      )}
    </View>
  );

  return (
    <CloudBackground>
      <FlatList
        data={items}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <View className="px-3">
            <DocumentRow document={item} onMore={setActionsFor} />
          </View>
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
        <Pressable
          onPress={() => router.push('/import')}
          accessibilityRole="button"
          accessibilityLabel="Import"
          className="absolute right-5 flex-row items-center gap-2 rounded-full bg-accent py-3.5 pl-4 pr-5 active:opacity-85"
          style={{ bottom: insets.bottom + (hasPlayer ? 160 : 92), boxShadow: cardShadow }}
        >
          <Plus size={20} color={t.accentForeground} strokeWidth={2.4} />
          <Text className="text-[15px] font-semibold text-accent-foreground">Import</Text>
        </Pressable>
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
