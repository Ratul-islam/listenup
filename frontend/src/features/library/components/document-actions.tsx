import { router } from 'expo-router';
import { useToast } from 'heroui-native';
import { BookOpenCheck, Check, CloudDownload, Download, Folder, FolderInput, FolderPlus, Languages, Library, ListX, Pencil, PenLine, Podcast, RefreshCw, ScanText, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { ActionSheet, SheetAction } from '@/components/ui/action-sheet';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { ExportPanel } from '@/features/exports/components/export-panel';
import { NameForm } from '@/features/folders/components/folder-name-sheet';
import { offlineFiles, useOfflineStore } from '@/features/offline/offline-files';
import { OfflinePanel } from '@/features/offline/offline-panel';
import { useCreateFolder, useFolders, useMoveDocument } from '@/features/folders/hooks/use-folders';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { useAddToPodcast, useRemoveFromPodcast } from '@/features/podcast/hooks';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';
import { LANGS, LANGUAGE_NAMES, type Lang } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import { documentsApi } from '../api/documents.api';
import { useDeleteDocument, useInvalidateDocuments, useRenameDocument, useReprocessDocument, useTranslateDocument } from '../hooks/use-documents';
import type { DocumentSummary } from '../types';

interface DocumentActionsProps {
  document: DocumentSummary | null;
  onClose: () => void;
  /** After it's deleted (e.g. leave its script screen) */
  onDeleted?: () => void;
}

export function DocumentActions({ document, onClose, onDeleted }: DocumentActionsProps) {
  const t = useTokens();
  const { toast } = useToast();
  const [mode, setMode] = useState<'menu' | 'rename' | 'move' | 'new-folder' | 'export' | 'offline' | 'translate' | 'podcast' | 'delete'>('menu');
  const downloaded = useOfflineStore((s) => (document ? !!s.downloads[document.id] : false));
  const [title, setTitle] = useState('');
  const rename = useRenameDocument();
  const reprocess = useReprocessDocument();
  const remove = useDeleteDocument();
  const translate = useTranslateDocument();
  const folders = useFolders();
  const move = useMoveDocument();
  const createFolder = useCreateFolder();
  const addToPodcast = useAddToPodcast();
  const removeFromPodcast = useRemoveFromPodcast();
  const invalidate = useInvalidateDocuments();

  const close = () => {
    setMode('menu');
    onClose();
  };
  const fail = (e: unknown) =>
    toast.show({
      variant: 'danger',
      label: getErrorMessage(e),
      ...(hasErrorCode(e, 'TRANSLATION_LIMIT_REACHED', 'PREMIUM_REQUIRED') && {
        actionLabel: 'See plans',
        onActionPress: ({ hide }) => {
          hide('all');
          router.push('/plans');
        },
      }),
    });

  const translateTo = (language: Lang) => {
    if (!document) return;
    translate.mutate(
      { id: document.id, language },
      {
        onSuccess: () => toast.show({ label: `Translating into ${LANGUAGE_NAMES[language]}`, description: 'It will appear on your shelf when it’s ready.' }),
        onError: fail,
        onSettled: close,
      },
    );
  };

  // Adding again rebuilds the episode in the current voice
  const podcastAdd = () => {
    if (!document) return;
    addToPodcast.mutate(document.id, {
      onSuccess: () =>
        toast.show({
          label: document.inPodcast ? 'Updating the episode' : 'Adding to your podcast',
          description: 'It shows up in your podcast app once it’s ready.',
          actionLabel: 'Open',
          onActionPress: ({ hide }) => {
            hide('all');
            router.push('/podcast');
          },
        }),
      onError: fail,
      onSettled: close,
    });
  };

  const moveTo = async (folderId: string | null, folderName: string) => {
    if (!document) return;
    await move.mutateAsync({ id: document.id, folderId });
    // Keep the open player's copy in step, so "play next" looks in the right place
    usePlayerStore.setState((s) => (s.document?.id === document.id ? { document: { ...s.document, folderId } } : {}));
    toast.show({ label: folderId ? `Moved to ${folderName}` : 'Moved to your shelf' });
    close();
  };

  // Between the Soundshelf and Studio
  const moveScript = async (script: boolean) => {
    if (!document) return;
    try {
      await documentsApi.setScript(document.id, script);
      await invalidate();
      toast.show({
        label: script ? 'Moved to Studio' : 'Moved to your Soundshelf',
        ...(script && {
          actionLabel: 'Open',
          onActionPress: ({ hide }: { hide: (ids?: string | string[] | 'all') => void }) => {
            hide('all');
            router.push({ pathname: '/script/[id]', params: { id: document.id } });
          },
        }),
      });
      close();
    } catch (e) {
      fail(e);
    }
  };

  if (!document) return null;
  const canOcr = (document.kind === 'PDF' || document.kind === 'IMAGE') && !document.translatedFromId;
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
                ? 'MP3 and subtitles'
                : mode === 'translate'
                  ? 'Translate into'
                  : mode === 'offline'
                    ? 'Listen offline'
                    : mode === 'podcast'
                      ? 'In your podcast'
                      : document.title
      }
    >
      {mode === 'menu' && document.isScript ? (
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
          {document.status === 'READY' ? (
            <SheetAction icon={<Download size={18} color={t.foreground} />} label="Download MP3 and subtitles" onPress={() => setMode('export')} />
          ) : null}
          <SheetAction
            icon={<Library size={18} color={t.foreground} />}
            label="Move to Soundshelf"
            detail="Keep it with the things you listen to"
            onPress={() => void moveScript(false)}
          />
          <SheetAction icon={<Trash2 size={18} color={t.danger} />} label="Delete" destructive onPress={() => setMode('delete')} />
        </>
      ) : null}

      {mode === 'menu' && !document.isScript ? (
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
            <SheetAction
              icon={<CloudDownload size={18} color={t.foreground} />}
              label={downloaded ? 'Downloaded for offline' : 'Download for offline'}
              onPress={() => setMode('offline')}
            />
          ) : null}
          {document.status === 'READY' ? (
            <SheetAction icon={<Download size={18} color={t.foreground} />} label="Download MP3 and subtitles" onPress={() => setMode('export')} />
          ) : null}
          {document.status === 'READY' ? (
            <SheetAction
              icon={<PenLine size={18} color={t.foreground} />}
              label="Move to Studio"
              detail="Edit it as a voiceover script"
              onPress={() => void moveScript(true)}
            />
          ) : null}
          {document.status === 'READY' ? (
            <SheetAction
              icon={<Podcast size={18} color={t.foreground} />}
              label={document.inPodcast ? 'In your podcast' : 'Add to podcast'}
              detail={document.inPodcast ? 'Update or remove the episode' : 'Plus · Listen in any podcast app'}
              disabled={addToPodcast.isPending}
              onPress={() => (document.inPodcast ? setMode('podcast') : podcastAdd())}
            />
          ) : null}
          {document.status === 'READY' ? (
            <SheetAction
              icon={<BookOpenCheck size={18} color={t.foreground} />}
              label="Summary and quiz"
              detail="Key points and 10 questions to test yourself"
              onPress={() => {
                close();
                router.push({ pathname: '/study/[id]', params: { id: document.id } });
              }}
            />
          ) : null}
          {document.status === 'READY' ? (
            <SheetAction
              icon={<Languages size={18} color={t.foreground} />}
              label="Translate"
              detail="Listen to it in another language"
              onPress={() => setMode('translate')}
            />
          ) : null}
          {document.status === 'READY' || document.status === 'FAILED' ? (
            <SheetAction
              icon={<ListX size={18} color={t.foreground} />}
              label={document.keepClutter ? 'Skip citations and links' : 'Read citations and links too'}
              detail={
                document.editedAt
                  ? 'Reads the original again, which undoes your edits'
                  : document.keepClutter
                    ? 'Also page numbers and reference lists'
                    : 'Reads the document again with everything in it'
              }
              disabled={busy}
              onPress={() =>
                reprocess.mutate(
                  { id: document.id, ocr: false, keepClutter: !document.keepClutter },
                  { onSuccess: () => toast.show({ label: 'Reading the document again' }), onError: fail, onSettled: close },
                )
              }
            />
          ) : null}
          {canOcr ? (
            <SheetAction
              icon={<ScanText size={18} color={t.foreground} />}
              label="Read again with OCR"
              detail={document.editedAt ? 'Reads the original again, which undoes your edits' : 'For scans, or Bangla text that sounds wrong'}
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

      {mode === 'offline' ? <OfflinePanel document={document} /> : null}

      {mode === 'translate' ? (
        <ScrollView style={{ maxHeight: 380 }}>
          {LANGS.filter((lang) => lang !== document.language).map((lang) => (
            <SheetAction
              key={lang}
              icon={<Languages size={18} color={t.foreground} />}
              label={LANGUAGE_NAMES[lang]}
              disabled={translate.isPending}
              onPress={() => translateTo(lang)}
            />
          ))}
        </ScrollView>
      ) : null}

      {mode === 'podcast' ? (
        <>
          <SheetAction
            icon={<RefreshCw size={18} color={t.foreground} />}
            label="Update the episode"
            detail="Uses your current voice and emotions"
            disabled={addToPodcast.isPending}
            onPress={podcastAdd}
          />
          <SheetAction
            icon={<X size={18} color={t.foreground} />}
            label="Remove from podcast"
            disabled={removeFromPodcast.isPending}
            onPress={() =>
              removeFromPodcast.mutate(document.id, { onSuccess: () => toast.show({ label: 'Removed from your podcast' }), onError: fail, onSettled: close })
            }
          />
          <SheetAction
            icon={<Podcast size={18} color={t.foreground} />}
            label="Open your podcast"
            onPress={() => {
              close();
              router.push('/podcast');
            }}
          />
        </>
      ) : null}

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
                  offlineFiles.remove(document.id);
                  toast.show({ label: 'Deleted' });
                  close();
                  onDeleted?.();
                },
              })
            }
          />
        </View>
      ) : null}
    </ActionSheet>
  );
}
