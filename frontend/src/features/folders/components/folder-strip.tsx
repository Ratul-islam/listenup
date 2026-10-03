import { router } from 'expo-router';
import { Folder as FolderIcon, FolderPlus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import type { Folder } from '../api/folders.api';
import { useCreateFolder } from '../hooks/use-folders';
import { FolderActions } from './folder-actions';
import { FolderNameSheet } from './folder-name-sheet';

const TILE = 'h-[104px] w-[132px] justify-between rounded-3xl p-3.5';

/** Folders across the top of the shelf; tap to open, hold for rename/delete */
export function FolderStrip({ folders }: { folders: Folder[] }) {
  const t = useTokens();
  const create = useCreateFolder();
  const [naming, setNaming] = useState(false);
  const [actionsFor, setActionsFor] = useState<Folder | null>(null);

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2.5 px-5">
        <Pressable
          onPress={() => setNaming(true)}
          accessibilityRole="button"
          className={`${TILE} border border-dashed border-separator active:bg-default`}
        >
          <FolderPlus size={22} color={t.accent} strokeWidth={1.9} />
          <Text className="text-[15px] font-semibold text-accent">New folder</Text>
        </Pressable>

        {folders.map((folder) => (
          <Pressable
            key={folder.id}
            onPress={() => router.push({ pathname: '/folder/[id]', params: { id: folder.id } })}
            onLongPress={() => {
              haptics.tap();
              setActionsFor(folder);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${folder.name}, ${folder.itemCount} items`}
            className={`${TILE} bg-surface active:opacity-80 dark:border dark:border-border`}
          >
            <IconTile size={34}>
              <FolderIcon size={17} color={t.accent} strokeWidth={2} />
            </IconTile>
            <View>
              <Text className="text-[15px] font-semibold" numberOfLines={1}>{folder.name}</Text>
              <Text variant="caption">{folder.itemCount === 1 ? '1 item' : `${folder.itemCount} items`}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <FolderNameSheet
        visible={naming}
        title="New folder"
        submitLabel="Create folder"
        onClose={() => setNaming(false)}
        onSubmit={async (name) => {
          await create.mutateAsync(name);
          haptics.success();
          setNaming(false);
        }}
      />
      <FolderActions folder={actionsFor} onClose={() => setActionsFor(null)} />
    </>
  );
}
