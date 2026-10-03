import { router, useLocalSearchParams } from 'expo-router';
import { MoreHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { DocumentActions } from '@/features/library/components/document-actions';
import { DocumentRow } from '@/features/library/components/document-row';
import { useDocuments } from '@/features/library/hooks/use-documents';
import type { DocumentSummary } from '@/features/library/types';
import { useTokens } from '@/lib/use-tokens';

import { FolderActions } from '../components/folder-actions';
import { useFolder } from '../hooks/use-folders';

/** One folder's items */
export default function FolderScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: folder } = useFolder(id);
  const { data, isLoading, isFetching, refetch } = useDocuments({ category: 'all', sort: 'recent', folder: id });
  const [actionsFor, setActionsFor] = useState<DocumentSummary | null>(null);
  const [folderMenu, setFolderMenu] = useState(false);
  const items = data?.items ?? [];

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
        ListHeaderComponent={
          <View className="gap-1 px-5 pb-4" style={{ paddingTop: insets.top + 6 }}>
            <ScreenHeader
              title={folder?.name ?? ''}
              onBack={router.back}
              right={
                <IconButton accessibilityLabel="Folder options" onPress={() => setFolderMenu(true)}>
                  <MoreHorizontal size={21} color={t.foreground} />
                </IconButton>
              }
            />
            {folder ? <Text variant="caption">{folder.itemCount === 1 ? '1 item' : `${folder.itemCount} items`}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <View className="items-center gap-1 px-10 py-16">
              <Text variant="title" className="text-center">This folder is empty</Text>
              <Text variant="caption" className="text-center">On your shelf, tap ⋯ next to an item and choose Move to folder.</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => void refetch()} tintColor={t.accent} colors={[t.accent]} />}
      />

      <DocumentActions document={actionsFor} onClose={() => setActionsFor(null)} />
      <FolderActions folder={folderMenu ? (folder ?? null) : null} onClose={() => setFolderMenu(false)} onDeleted={router.back} />
    </CloudBackground>
  );
}
