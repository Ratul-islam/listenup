import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useToast } from 'heroui-native';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { documentsApi } from '@/features/library/api/documents.api';
import { useInvalidateDocuments } from '@/features/library/hooks/use-documents';
import type { DocumentSummary } from '@/features/library/types';
import { formatMinutes } from '@/features/player/hooks/use-player';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { ApiError, getErrorMessage } from '@/lib/api/api-error';
import { LANGUAGE_NAMES } from '@/lib/languages';

import { catalogApi, type CatalogItem } from '../api/catalog.api';
import { catalogKey } from '../hooks/use-catalog';
import { BookCover } from './book-cover';

const POLL_MS = 2000;
// A long book fetched for the first time can take a minute to split into parts
const WAIT_MS = 120_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Still being prepared after the wait: it'll be on the shelf shortly */
class StillPreparing extends Error {}

/** The title's document on the shelf, added now if it isn't there (or was deleted since) */
async function onShelf(item: CatalogItem) {
  if (item.documentId) {
    try {
      return await documentsApi.get(item.documentId);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
  }
  return catalogApi.add(item.id);
}

/** The title on the shelf and ready to play */
async function readyToPlay(item: CatalogItem): Promise<DocumentSummary> {
  let doc = await onShelf(item);
  // It couldn't be fetched last time (the source was down): try again
  if (doc.status === 'FAILED') doc = await documentsApi.reprocess(doc.id, false);
  const deadline = Date.now() + WAIT_MS;
  while (doc.status !== 'READY' && doc.status !== 'FAILED' && Date.now() < deadline) {
    await sleep(POLL_MS);
    doc = await documentsApi.get(doc.id);
  }
  if (doc.status === 'FAILED') throw new Error(doc.error ?? "Couldn't get this title ready. Try again in a moment.");
  if (doc.status !== 'READY') throw new StillPreparing();
  return doc;
}

/** A free classic: what it is and how long, and one button that puts it on the shelf and plays it */
export function TitleSheet({ item, onClose }: { item: CatalogItem | null; onClose: () => void }) {
  return (
    <ActionSheet visible={!!item} onClose={onClose}>
      {item ? <TitleDetails item={item} onClose={onClose} /> : null}
    </ActionSheet>
  );
}

function TitleDetails({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  const { toast } = useToast();
  const client = useQueryClient();
  const invalidateDocuments = useInvalidateDocuments();
  const [error, setError] = useState<string | null>(null);
  const listen = useMutation({
    mutationFn: () => readyToPlay(item),
    onMutate: () => setError(null),
    onSuccess: (doc) => {
      onClose();
      void audioEngine.open(doc.id);
      router.push('/player');
    },
    onError: (e) => {
      if (!(e instanceof StillPreparing)) return setError(getErrorMessage(e));
      onClose();
      toast.show({ label: `“${item.title}” is still being prepared`, description: "It'll be on your Soundshelf in a moment." });
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: catalogKey });
      void invalidateDocuments();
    },
  });
  const added = !!item.documentId;

  return (
    <View className="gap-4 pb-1">
      <View className="flex-row gap-4">
        <BookCover item={item} width={96} added={added} />
        <View className="flex-1 justify-center gap-1">
          <Text variant="title" numberOfLines={3}>{item.title}</Text>
          {item.englishTitle ? <Text variant="caption" numberOfLines={1}>{item.englishTitle}</Text> : null}
          <Text className="text-[15px] font-medium" numberOfLines={1}>{item.author}</Text>
          <Text variant="caption">{`${formatMinutes(item.minutes * 60)} · ${LANGUAGE_NAMES[item.language]}`}</Text>
        </View>
      </View>
      <Text className="text-[15px] leading-[23px] text-muted">{item.blurb}</Text>
      <InlineAlert message={error} />
      <PrimaryButton
        label={listen.isPending ? (added ? 'Opening…' : 'Getting it ready…') : 'Listen'}
        isLoading={listen.isPending}
        onPress={() => listen.mutate()}
      />
      <Text variant="caption" className="text-center">
        {added ? 'On your Soundshelf.' : 'Free to keep. It goes on your Soundshelf.'}
        {' Text from '}
        <Text variant="caption" className="font-semibold text-accent" onPress={() => void Linking.openURL(item.source.url)} accessibilityRole="link">
          {item.source.name}
        </Text>
        .
      </Text>
    </View>
  );
}

/** One title in a list: its cover, name, author and length */
export function TitleRow({ item, onPress }: { item: CatalogItem; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.englishTitle ?? item.title}, ${item.author}, ${formatMinutes(item.minutes * 60)}${item.documentId ? ', on your shelf' : ''}`}
      className="flex-row items-center gap-3.5 rounded-2xl p-2 active:bg-default"
    >
      <BookCover item={item} width={52} added={!!item.documentId} />
      <View className="flex-1 gap-0.5">
        <Text className="text-[16px] font-semibold" numberOfLines={2}>{item.title}</Text>
        <Text variant="caption" numberOfLines={1}>{item.author}</Text>
        <Text variant="caption">{`${formatMinutes(item.minutes * 60)} · ${LANGUAGE_NAMES[item.language]}`}</Text>
      </View>
    </Pressable>
  );
}
