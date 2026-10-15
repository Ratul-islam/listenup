import { useToast } from 'heroui-native';
import { useEffect, useState } from 'react';

import { documentsApi } from '@/features/library/api/documents.api';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';

import { expressionsApi, type NarrationChoice } from '../api/expressions.api';

const POLL_MS = 3000;

/**
 * Reloads the open document's emotions into the player (if it's still open).
 * With `replay`, the part playing is voiced again from the line being heard.
 * Returns whether that replay started.
 */
export async function refresh(documentId: string, { replay = false } = {}) {
  const { voiceId } = usePlayerStore.getState();
  const reader = await documentsApi.script(documentId, voiceId ?? undefined);
  if (usePlayerStore.getState().documentId !== documentId) return false;
  return audioEngine.applyReader(reader, { replay });
}

/** When a change will be heard: now if the part playing is being voiced again, otherwise from the next one */
const heard = (replaying: boolean) => (replaying ? 'Replaying this part so you hear it.' : 'You’ll hear it from the next part.');

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
            const replaying = await refresh(documentId, { replay: true });
            const { chunks, document, cast } = usePlayerStore.getState();
            const lines = chunks.reduce((n, c) => n + c.expressions.emotions.filter((m) => m.ai).length, 0);
            const voices = cast.filter((c) => c.ownVoice).length;
            const directed = [lines ? `${lines} ${lines === 1 ? 'line' : 'lines'} directed` : '', voices ? `${voices} ${voices === 1 ? 'character has' : 'characters have'} their own voice` : ''].filter(Boolean);
            haptics.success();
            // Say what was actually done: nothing to direct is a result too, not a silent success
            toast.show(
              directed.length
                ? { variant: 'success', label: directed.join(', '), description: `${heard(replaying)} ${voices ? 'Change who reads whom under More.' : 'Hold any line to change it.'}` }
                : { label: 'No lines needed directing', description: document?.narration?.style ? `The story’s style still colours every line. ${heard(replaying)}` : 'This text reads best plainly. You can still add feelings yourself.' },
            );
          } else {
            usePlayerStore.setState((s) => (s.document ? { document: { ...s.document, autoExpression: doc.autoExpression } } : {}));
            toast.show({ variant: 'danger', label: "Couldn't direct the story", description: 'Try again in a moment.' });
          }
        })
        .catch(() => {}); // keep polling through network blips
    }, POLL_MS);
    return () => {
      done = true;
      clearInterval(timer);
    };
  }, [status, documentId, toast]);

  const start = async (choice: NarrationChoice) => {
    if (!documentId) return false;
    setBusy(true);
    try {
      // The AI directs from where the listener is, so say where that is first
      await audioEngine.report();
      const document = await expressionsApi.startAuto(documentId, choice);
      usePlayerStore.setState({ document });
      toast.show({ label: 'Directing your story…', description: 'AI is reading ahead. You’ll hear it in a moment.' });
      return true;
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Changes or turns off the story style without a new AI run */
  const setNarration = async (choice: NarrationChoice) => {
    if (!documentId) return false;
    setBusy(true);
    try {
      const document = await expressionsApi.setNarration(documentId, choice);
      usePlayerStore.setState({ document });
      const replaying = await refresh(documentId, { replay: true });
      toast.show({ label: choice.style ? 'Style changed' : 'Style turned off', description: heard(replaying) });
      return true;
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const clear = async (only: 'ai' | 'all') => {
    if (!documentId) return;
    setBusy(true);
    try {
      await expressionsApi.clear(documentId, only);
      const replaying = await refresh(documentId, { replay: true });
      toast.show({ label: only === 'ai' ? 'AI emotions removed' : 'All emotions removed', description: heard(replaying) });
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return { running: status === 'RUNNING', busy, hasAny, hasAi, start, setNarration, clear };
}
