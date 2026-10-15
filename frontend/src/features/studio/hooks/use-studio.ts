import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { documentsKey } from '@/features/library/hooks/use-documents';
import { audioEngine } from '@/features/player/engine/audio-engine';

import { studioApi, type StudioSettings } from '../api/studio.api';

/** Platforms, narration types, tones and templates; they change only with a server update */
export function useStudioCatalog() {
  return useQuery({ queryKey: ['studio-catalog'], queryFn: studioApi.catalog, staleTime: 60 * 60_000 });
}

/** Saves a script's platform and sound; its parts, its MP3 and the player catch up */
export function useUpdateStudio(documentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: StudioSettings) => studioApi.update(documentId, settings),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['document', documentId] });
      void client.invalidateQueries({ queryKey: ['script', documentId] });
      void client.invalidateQueries({ queryKey: ['export', documentId] });
      void client.invalidateQueries({ queryKey: documentsKey });
      void audioEngine.refresh(documentId);
    },
  });
}
