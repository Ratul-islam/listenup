import { router } from 'expo-router';
import { Folder as FolderIcon, FolderPlus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView } from 'react-native';

import { Text } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import type { Folder } from '../api/folders.api';
import { useCreateFolder } from '../hooks/use-folders';
import { FolderActions } from './folder-actions';
import { FolderNameSheet } from './folder-name-sheet';

const PILL = 'h-9 flex-row items-center gap-1.5 rounded-full';

/** Folders in a row above the shelf's list; tap to open, hold for rename/delete */
export function FolderStrip({ folders }: { folders: Folder[] }) {
  const t = useTokens();
  const create = useCreateFolder();
  const [naming, setNaming] = useState(false);
  const [actionsFor, setActionsFor] = useState<Folder | null>(null);

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-5">
        {folders.map((folder) => (
          <Pressable
            key={folder.id}
            onPress={() => router.push({ pathname: '/folder/[id]', params: { id: folder.id } })}
            onLongPress={() => {
              haptics.tap();
              setActionsFor(folder);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${folder.name}, ${folder.itemCount === 1 ? '1 item' : `${folder.itemCount} items`}`}
            className={`${PILL} max-w-[190px] bg-surface pl-3 pr-3.5 active:opacity-80 dark:border dark:border-border`}
          >
            <FolderIcon size={15} color={t.accent} strokeWidth={2} />
            <Text className="shrink text-[13.5px] font-semibold" numberOfLines={1}>{folder.name}</Text>
            <Text className="text-[12.5px] text-muted">{folder.itemCount}</Text>
          </Pressable>
        ))}

        <Pressable
          onPress={() => setNaming(true)}
          accessibilityRole="button"
          accessibilityLabel="New folder"
          className={`${PILL} border border-dashed border-separator pl-3 pr-3.5 active:bg-default`}
        >
          <FolderPlus size={15} color={t.accent} strokeWidth={2} />
          <Text className="text-[13.5px] font-semibold text-accent">New folder</Text>
        </Pressable>
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
