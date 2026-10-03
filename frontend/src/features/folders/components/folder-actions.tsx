import { useToast } from 'heroui-native';
import { Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ActionSheet, SheetAction } from '@/components/ui/action-sheet';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { getErrorMessage } from '@/lib/api/api-error';
import { useTokens } from '@/lib/use-tokens';

import type { Folder } from '../api/folders.api';
import { useDeleteFolder, useRenameFolder } from '../hooks/use-folders';
import { NameForm } from './folder-name-sheet';

interface FolderActionsProps {
  folder: Folder | null;
  onClose: () => void;
  onDeleted?: () => void;
}

/** Rename or delete a folder; deleting puts its items back on the shelf */
export function FolderActions({ folder, onClose, onDeleted }: FolderActionsProps) {
  const t = useTokens();
  const { toast } = useToast();
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete'>('menu');
  const rename = useRenameFolder();
  const remove = useDeleteFolder();

  const close = () => {
    setMode('menu');
    onClose();
  };

  if (!folder) return null;

  return (
    <ActionSheet visible onClose={close} title={mode === 'delete' ? `Delete "${folder.name}"?` : mode === 'rename' ? 'Rename folder' : folder.name}>
      {mode === 'menu' ? (
        <>
          <SheetAction icon={<Pencil size={18} color={t.foreground} />} label="Rename" onPress={() => setMode('rename')} />
          <SheetAction icon={<Trash2 size={18} color={t.danger} />} label="Delete folder" destructive onPress={() => setMode('delete')} />
        </>
      ) : null}

      {mode === 'rename' ? (
        <NameForm
          submitLabel="Save name"
          initial={folder.name}
          onSubmit={async (name) => {
            await rename.mutateAsync({ id: folder.id, name });
            close();
          }}
        />
      ) : null}

      {mode === 'delete' ? (
        <View className="gap-4">
          <Text className="text-[15px] leading-[23px] text-muted">
            {folder.itemCount
              ? `The ${folder.itemCount === 1 ? 'item' : `${folder.itemCount} items`} inside will go back to your shelf. Nothing is deleted.`
              : 'The folder is empty.'}
          </Text>
          <PrimaryButton
            label="Delete folder"
            isLoading={remove.isPending}
            onPress={() =>
              remove.mutate(folder.id, {
                onSuccess: () => {
                  toast.show({ label: 'Folder deleted' });
                  close();
                  onDeleted?.();
                },
                onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }),
              })
            }
          />
        </View>
      ) : null}
    </ActionSheet>
  );
}
