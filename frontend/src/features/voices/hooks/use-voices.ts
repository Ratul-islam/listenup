import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { voicesApi, type PreferencesUpdate, type VoicePreferences } from '../api/voices.api';

export const voicesKey = ['voices'] as const;

type VoicesData = Awaited<ReturnType<typeof voicesApi.list>>;

/**
 * The voices to choose from. A speaker's voice from a voice translation is offered only in
 * that translation (`documentId`); everywhere else it's left out.
 */
export function useVoices(documentId?: string) {
  return useQuery({
    queryKey: voicesKey,
    queryFn: voicesApi.list,
    staleTime: 5 * 60_000,
    select: (data: VoicesData) => ({ ...data, voices: data.voices.filter((v) => !v.forDocument || v.forDocument === documentId) }),
  });
}

/** A voice by id, whichever it is (a speaker's voice included), to show its name */
export function useVoice(id: string | null | undefined) {
  const { data } = useQuery({ queryKey: voicesKey, queryFn: voicesApi.list, staleTime: 5 * 60_000 });
  return data?.voices.find((v) => v.id === id);
}

export function useUpdatePreferences() {
  const client = useQueryClient();
  const write = (update: (p: VoicePreferences) => VoicePreferences) =>
    client.setQueryData(voicesKey, (old: VoicesData | undefined) => (old ? { ...old, preferences: update(old.preferences) } : old));

  // Optimistic, so switches and chips respond instantly; rolled back if the save fails
  return useMutation({
    mutationFn: (body: PreferencesUpdate) => voicesApi.updatePreferences(body),
    onMutate: (body) => {
      const previous = client.getQueryData<VoicesData>(voicesKey)?.preferences;
      write((p) => ({ ...p, ...body, voices: { ...p.voices, ...body.voices } }));
      return { previous };
    },
    onError: (_e, _body, context) => {
      if (context?.previous) write(() => context.previous!);
    },
    onSuccess: (preferences) => {
      write(() => preferences);
      void client.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useUsage() {
  return useQuery({ queryKey: ['usage'], queryFn: voicesApi.usage });
}
