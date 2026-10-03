import { useToast } from 'heroui-native';
import { Check, Download, Folder, FolderInput, FolderPlus, Library, Pencil, ScanText, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { ActionSheet, SheetAction } from '@/components/ui/action-sheet';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { ExportPanel } from '@/features/exports/components/export-panel';
import { NameForm } from '@/features/folders/components/folder-name-sheet';
import { useCreateFolder, useFolders, useMoveDocument } from '@/features/folders/hooks/use-folders';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { getErrorMessage } from '@/lib/api/api-error';
import { useTokens } from '@/lib/use-tokens';

import { useDeleteDocument, useRenameDocument, useReprocessDocument } from '../hooks/use-documents';
import type { DocumentSummary } from '../types';

interface DocumentActionsProps {
  document: DocumentSummary | null;
  onClose: () => void;
}

export function DocumentActions({ document, onClose }: DocumentActionsProps) {
  const t = useTokens();
  const { toast } = useToast();
  const [mode, setMode] = useState<'menu' | 'rename' | 'move' | 'new-folder' | 'export' | 'delete'>('menu');
  const [title, setTitle] = useState('');
  const rename = useRenameDocument();
  const reprocess = useReprocessDocument();
  const remove = useDeleteDocument();
  const folders = useFolders();
  const move = useMoveDocument();
  const createFolder = useCreateFolder();

  const close = () => {
    setMode('menu');
    onClose();
  };
  const fail = (e: unknown) => toast.show({ variant: 'danger', label: getErrorMessage(e) });

  const moveTo = async (folderId: string | null, folderName: string) => {
    if (!document) return;
    await move.mutateAsync({ id: document.id, folderId });
    // Keep the open player's copy in step, so "play next" looks in the right place
    usePlayerStore.setState((s) => (s.document?.id === document.id ? { document: { ...s.document, folderId } } : {}));
    toast.show({ label: folderId ? `Moved to ${folderName}` : 'Moved to your shelf' });
    close();
  };

  if (!document) return null;
  const canOcr = document.kind === 'PDF' || document.kind === 'IMAGE';
  const busy = document.status === 'PENDING' || document.status === 'PROCESSING';

  return (
    <ActionSheet
      visible
      onClose={close}
      title={
        mode === 'delete'
          ? `Delete "${document.title}"?`
          : mode === 'move'
            ? 'Move to folder'
            : mode === 'new-folder'
              ? 'New folder'
              : mode === 'export'
                ? 'Download MP3'
                : document.title
      }
    >
      {mode === 'menu' ? (
        <>
          {document.status === 'FAILED' ? (
            <Text variant="body" className="mb-1 text-muted">{document.error ?? "We couldn't read this file. Check it opens on your phone and try again."}</Text>
          ) : null}
          <SheetAction
            icon={<Pencil size={18} color={t.foreground} />}
            label="Rename"
            onPress={() => {
              setTitle(document.title);
              setMode('rename');
            }}
          />
          <SheetAction icon={<FolderInput size={18} color={t.foreground} />} label="Move to folder" onPress={() => setMode('move')} />
          {document.status === 'READY' ? (
            <SheetAction icon={<Download size={18} color={t.foreground} />} label="Download MP3" onPress={() => setMode('export')} />
          ) : null}
          {canOcr ? (
            <SheetAction
              icon={<ScanText size={18} color={t.foreground} />}
              label="Read again with OCR"
              detail="For scans, or Bangla text that sounds wrong"
              disabled={busy}
              onPress={() =>
                reprocess.mutate(
                  { id: document.id, ocr: true },
                  { onSuccess: () => toast.show({ label: 'Reading the document again' }), onError: fail, onSettled: close },
                )
              }
            />
          ) : null}
          <SheetAction icon={<Trash2 size={18} color={t.danger} />} label="Delete" destructive onPress={() => setMode('delete')} />
        </>
      ) : null}

      {mode === 'move' ? (
        <ScrollView style={{ maxHeight: 380 }}>
          {document.folderId ? (
            <SheetAction icon={<Library size={18} color={t.foreground} />} label="Soundshelf" detail="Not in a folder" onPress={() => void moveTo(null, '').catch(fail)} />
          ) : null}
          {folders.data?.map((f) => (
            <SheetAction
              key={f.id}
              icon={f.id === document.folderId ? <Check size={18} color={t.accent} /> : <Folder size={18} color={t.foreground} />}
              label={f.name}
              detail={f.itemCount === 1 ? '1 item' : `${f.itemCount} items`}
              disabled={f.id === document.folderId || move.isPending}
              onPress={() => void moveTo(f.id, f.name).catch(fail)}
            />
          ))}
          <SheetAction icon={<FolderPlus size={18} color={t.accent} />} label="New folder" onPress={() => setMode('new-folder')} />
        </ScrollView>
      ) : null}

      {mode === 'export' ? <ExportPanel document={document} /> : null}

      {mode === 'new-folder' ? (
        <NameForm
          submitLabel="Create and move"
          onSubmit={async (name) => {
            const folder = await createFolder.mutateAsync(name);
            await moveTo(folder.id, folder.name);
          }}
        />
      ) : null}

      {mode === 'rename' ? (
        <View className="gap-4">
          <TextInput
            value={title}
            onChangeText={setTitle}
            autoFocus
            maxLength={200}
            accessibilityLabel="Title"
            className="rounded-2xl border border-field-border bg-field px-4 py-3.5 font-sans text-[16px] text-foreground"
          />
          <PrimaryButton
            label="Save title"
            isLoading={rename.isPending}
            isDisabled={!title.trim()}
            onPress={() => rename.mutate({ id: document.id, title: title.trim() }, { onError: fail, onSuccess: close })}
          />
        </View>
      ) : null}

      {mode === 'delete' ? (
        <View className="gap-4">
          <Text variant="body" className="text-muted">
            The document, its audio and your listening position will be removed. This can&apos;t be undone.
          </Text>
          <PrimaryButton
            label="Delete"
            isLoading={remove.isPending}
            onPress={() =>
              remove.mutate(document.id, {
                onError: fail,
                onSuccess: () => {
                  if (usePlayerStore.getState().documentId === document.id) void audioEngine.close();
                  toast.show({ label: 'Deleted' });
                  close();
                },
              })
            }
          />
        </View>
      ) : null}
    </ActionSheet>
  );
}
