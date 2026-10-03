import { useToast } from 'heroui-native';
import { useEffect, useState } from 'react';

import { documentsApi } from '@/features/library/api/documents.api';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';

import { expressionsApi } from '../api/expressions.api';

const POLL_MS = 3000;

/** Reloads the open document's emotions into the player (if it's still open) */
async function refresh(documentId: string) {
  const { voiceId } = usePlayerStore.getState();
  const reader = await documentsApi.reader(documentId, voiceId ?? undefined);
  if (usePlayerStore.getState().documentId === documentId) audioEngine.applyReader(reader);
}

/**
 * "Make it expressive" for the open document: starts AI suggestions, follows
 * them until they're in, and removes emotions in bulk.
 */
export function useAutoExpression() {
  const { toast } = useToast();
  const documentId = usePlayerStore((s) => s.documentId);
  const status = usePlayerStore((s) => s.document?.autoExpression ?? null);
  const hasAny = usePlayerStore((s) => s.chunks.some((c) => c.expressions.emotions.length || c.expressions.sounds.length));
  const hasAi = usePlayerStore((s) => s.chunks.some((c) => c.expressions.emotions.some((m) => m.ai) || c.expressions.sounds.some((m) => m.ai)));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'RUNNING' || !documentId) return;
    let done = false;
    const timer = setInterval(() => {
      void documentsApi
        .get(documentId)
        .then(async (doc) => {
          if (done || doc.autoExpression === 'RUNNING') return;
          done = true;
          clearInterval(timer);
          if (doc.autoExpression === 'DONE') {
            await refresh(documentId);
            haptics.success();
            toast.show({ variant: 'success', label: 'Emotions added', description: "You'll hear them from the next part. Hold any line to change one." });
          } else {
            usePlayerStore.setState((s) => (s.document ? { document: { ...s.document, autoExpression: doc.autoExpression } } : {}));
            toast.show({ variant: 'danger', label: "Couldn't add emotions", description: 'Try again in a moment.' });
          }
        })
        .catch(() => {}); // keep polling through network blips
    }, POLL_MS);
    return () => {
      done = true;
      clearInterval(timer);
    };
  }, [status, documentId, toast]);

  const start = async () => {
    if (!documentId) return;
    setBusy(true);
    try {
      const document = await expressionsApi.startAuto(documentId);
      usePlayerStore.setState({ document });
      toast.show({ label: 'Adding emotions…', description: 'AI is reading ahead. Keep listening.' });
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const clear = async (only: 'ai' | 'all') => {
    if (!documentId) return;
    setBusy(true);
    try {
      await expressionsApi.clear(documentId, only);
      await refresh(documentId);
      toast.show({ label: only === 'ai' ? 'AI emotions removed' : 'All emotions removed' });
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return { running: status === 'RUNNING', busy, hasAny, hasAi, start, clear };
}
