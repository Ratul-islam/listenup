import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { voicesKey } from '@/features/voices/hooks/use-voices';

import { ownVoiceApi, type OwnVoiceState } from './api/own-voice.api';

export const ownVoiceKey = ['own-voice'] as const;

/**
 * Whether to show the way in to "Your voice": not where a voice can't be made
 * at all (unless they already have one to manage)
 */
export const offersOwnVoice = (state: OwnVoiceState | undefined): state is OwnVoiceState =>
  !!state && (!!state.voice || (state.blockedBy !== 'region' && state.blockedBy !== 'setup'));

export function useOwnVoice() {
  return useQuery({ queryKey: ownVoiceKey, queryFn: ownVoiceApi.get });
}

/** After the voice changes: the voice lists and each language's chosen voice change with it */
function useSettle() {
  const queryClient = useQueryClient();
  return (state: OwnVoiceState) => {
    queryClient.setQueryData(ownVoiceKey, state);
    void queryClient.invalidateQueries({ queryKey: voicesKey });
  };
}

export function useRecordOwnVoice() {
  const queryClient = useQueryClient();
  const settle = useSettle();
  return useMutation({
    mutationFn: ownVoiceApi.record,
    onSuccess: settle,
    // A failed try still counts toward the month's recordings
    onError: () => void queryClient.invalidateQueries({ queryKey: ownVoiceKey }),
  });
}

export function useRemoveOwnVoice() {
  const settle = useSettle();
  return useMutation({ mutationFn: ownVoiceApi.remove, onSuccess: settle });
}
