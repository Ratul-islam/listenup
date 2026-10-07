import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { audioEngine } from '@/features/player/engine/audio-engine';

import { pronunciationsApi } from './api/pronunciations.api';

export const pronunciationsKey = ['pronunciations'] as const;

export function usePronunciations() {
  return useQuery({ queryKey: pronunciationsKey, queryFn: pronunciationsApi.list, staleTime: 60_000 });
}

/** A changed pronunciation changes how scripts sound: refresh them, and the one playing */
function useAfterChange() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: pronunciationsKey });
    void client.invalidateQueries({ queryKey: ['script'] });
    void client.invalidateQueries({ queryKey: ['export'] });
    void audioEngine.refresh();
  };
}

export function useSavePronunciation() {
  const afterChange = useAfterChange();
  return useMutation({
    mutationFn: ({ id, word, sayAs }: { id?: string; word: string; sayAs: string }) =>
      id ? pronunciationsApi.update(id, { word, sayAs }) : pronunciationsApi.save({ word, sayAs }),
    onSuccess: afterChange,
  });
}

export function useRemovePronunciation() {
  const afterChange = useAfterChange();
  return useMutation({ mutationFn: pronunciationsApi.remove, onSuccess: afterChange });
}
