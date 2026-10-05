import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { useIncomingShare, type ResolvedSharePayload } from 'expo-sharing';
import { Spinner, useToast } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { CloudBackground } from '@/components/ui/cloud-background';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { documentsApi } from '../api/documents.api';
import { useInvalidateDocuments } from '../hooks/use-documents';

const URL_IN_TEXT = /https?:\/\/[^\s]+/i;
// Shared text this short with a link in it is a link share ("Title — https://…")
const LINK_SHARE_MAX_CHARS = 300;

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/** A shared file under a name the server recognises, copied into the cache first */
function localCopy(payload: ResolvedSharePayload, i: number) {
  const mime = payload.contentMimeType ?? payload.mimeType ?? '';
  const ext = EXTENSIONS[mime] ?? (payload.originalName?.split('.').pop() || 'bin');
  const base = payload.originalName?.replace(/\.[^.]+$/, '') || `Shared ${i + 1}`;
  const target = new File(Paths.cache, `share-${Date.now()}-${i}`, `${base}.${ext}`);
  target.parentDirectory.create({ intermediates: true, idempotent: true });
  new File(payload.contentUri!).copy(target);
  return { uri: target.uri, name: target.name, mimeType: mime || null };
}

/** Imports whatever was shared to ListenUp from another app: links, text, files and photos */
export default function ShareScreen() {
  const t = useTokens();
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();
  const { resolvedSharedPayloads, isResolving, clearSharedPayloads, error: shareError } = useIncomingShare();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (isResolving || started.current || !resolvedSharedPayloads.length) return;
    started.current = true;

    void (async () => {
      try {
        const added: string[] = [];
        for (const [i, payload] of resolvedSharedPayloads.entries()) {
          const text = payload.shareType === 'text' || payload.shareType === 'url' ? payload.value.trim() : '';
          const link = text.match(URL_IN_TEXT)?.[0];
          if (link && (payload.shareType === 'url' || text.length <= LINK_SHARE_MAX_CHARS)) {
            added.push((await documentsApi.fromUrl(link)).title);
          } else if (text) {
            added.push((await documentsApi.fromText({ text })).title);
          } else if (payload.contentUri) {
            added.push((await documentsApi.upload(localCopy(payload, i))).title);
          }
        }
        if (!added.length) throw new Error("ListenUp can't read that. Try a link, text, PDF, Word, ePub or a photo.");
        clearSharedPayloads();
        invalidate();
        haptics.success();
        toast.show({
          variant: 'success',
          label: 'Added to your Soundshelf',
          description: added.length === 1 ? `${added[0]} will be ready to play in a moment.` : `${added.length} items will be ready in a moment.`,
        });
        router.replace('/');
      } catch (e) {
        haptics.error();
        setError(getErrorMessage(e));
      }
    })();
  }, [isResolving, resolvedSharedPayloads, clearSharedPayloads, invalidate, toast]);

  const message = error ?? (shareError ? getErrorMessage(shareError) : null);

  return (
    <CloudBackground>
      <View className="flex-1 justify-center gap-4 px-6">
        {message ? (
          <>
            <InlineAlert message={message} />
            <PrimaryButton label="Back to Soundshelf" variant="secondary" onPress={() => router.replace('/')} />
          </>
        ) : (
          <View className="items-center gap-3">
            <Spinner color={t.accent} />
            <Text variant="caption">Adding it to your Soundshelf…</Text>
          </View>
        )}
      </View>
    </CloudBackground>
  );
}
