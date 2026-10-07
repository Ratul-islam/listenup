import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { documentsApi } from '@/features/library/api/documents.api';
import { documentsKey, useInvalidateDocuments } from '@/features/library/hooks/use-documents';
import type { DocumentList } from '@/features/library/types';
import { audioEngine } from '@/features/player/engine/audio-engine';

import { partsApi, type PartSettings } from '../api/parts.api';

const isBusy = (list?: DocumentList) => list?.items.some((d) => d.status === 'PENDING' || d.status === 'PROCESSING');

/** Studio's scripts, newest first; polls while one is still being split into parts */
export function useScripts() {
  const params = { view: 'scripts', category: 'all', sort: 'recent' } as const;
  return useQuery({
    queryKey: [...documentsKey, params],
    queryFn: () => documentsApi.list(params),
    refetchInterval: (query) => (isBusy(query.state.data) ? 2000 : false),
  });
}

export const scriptKey = (id: string, voiceId?: string | null) => ['script', id, voiceId ?? null] as const;

/** A script's parts, and which are voiced in this voice */
export function useScript(id: string, voiceId?: string | null) {
  return useQuery({ queryKey: scriptKey(id, voiceId), queryFn: () => documentsApi.script(id, voiceId ?? undefined), enabled: !!id });
}

/** After a part changes: the script, its MP3 status, the shelf, and the player if it's open */
function useAfterPartChange(documentId: string) {
  const client = useQueryClient();
  const invalidate = useInvalidateDocuments();
  return () => {
    void client.invalidateQueries({ queryKey: ['script', documentId] });
    void client.invalidateQueries({ queryKey: ['export', documentId] });
    void client.invalidateQueries({ queryKey: documentsKey });
    void invalidate();
    void audioEngine.refresh(documentId);
  };
}

export function usePartMutations(documentId: string) {
  const after = useAfterPartChange(documentId);
  return {
    edit: useMutation({ mutationFn: ({ index, text }: { index: number; text: string }) => partsApi.edit(documentId, index, text), onSuccess: after }),
    insert: useMutation({ mutationFn: ({ after: at, text }: { after: number; text: string }) => partsApi.insert(documentId, at, text), onSuccess: after }),
    remove: useMutation({ mutationFn: (index: number) => partsApi.remove(documentId, index), onSuccess: after }),
    retake: useMutation({ mutationFn: (index: number) => partsApi.retake(documentId, index), onSuccess: after }),
    retakeSentence: useMutation({
      mutationFn: ({ index, sentence }: { index: number; sentence: number }) => partsApi.retakeSentence(documentId, index, sentence),
      onSuccess: after,
    }),
    settings: useMutation({ mutationFn: ({ index, ...body }: PartSettings & { index: number }) => partsApi.settings(documentId, index, body), onSuccess: after }),
    replace: useMutation({ mutationFn: (body: Parameters<typeof partsApi.replace>[1]) => partsApi.replace(documentId, body), onSuccess: (r) => r.document && after() }),
  };
}
