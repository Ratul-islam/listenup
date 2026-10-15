import { router } from 'expo-router';
import { useToast } from 'heroui-native';
import { useState } from 'react';

import { usePlayerStore } from '@/features/player/store/player.store';
import { shareVoiceNote } from '@/features/voice-notes/voice-note';
import { getErrorMessage } from '@/lib/api/api-error';

import type { Range } from '../lib/marks';

/**
 * Sending words of the open document somewhere else: as a voice note through
 * the phone's share sheet, or to Explore as a clip.
 */
export function useLineShare(chunkIndex: number | undefined) {
  const { toast } = useToast();
  const documentId = usePlayerStore((s) => s.documentId);
  const document = usePlayerStore((s) => s.document);
  const chunk = usePlayerStore((s) => (chunkIndex === undefined ? undefined : s.chunks[chunkIndex]));
  const voiceId = usePlayerStore((s) => (chunk ? s.voices[chunk.language] : null));
  const tier = usePlayerStore((s) => (chunk ? s.tiers[chunk.language] : 'natural'));
  const [sending, setSending] = useState(false);

  const send = async (range: Range) => {
    if (!documentId || !chunk) return;
    setSending(true);
    try {
      await shareVoiceNote({ documentId, chunk, range, tier, voiceId });
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  // A line of your own writing, or of a free classic, can go to Explore as a clip (server voices only)
  const canPost =
    !!document &&
    !!chunk &&
    tier !== 'phone' &&
    !document.publicationId &&
    !document.translatedFromId &&
    (document.fromCatalog || (document.kind !== 'WEB' && document.kind !== 'EPUB'));

  const post = (range: Range) => {
    if (!documentId || !chunk) return;
    router.push({
      pathname: '/publish/[id]',
      params: {
        id: documentId,
        clip: '1',
        chunk: String(chunk.index),
        start: String(range.start),
        end: String(range.end),
        text: chunk.text.slice(range.start, range.end).trim(),
        title: document?.title ?? '',
        voiceId: voiceId ?? '',
      },
    });
  };

  return { send, sending, canPost, post };
}
