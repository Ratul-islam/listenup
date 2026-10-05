import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { documentsKey } from '@/features/library/hooks/use-documents';

import { podcastApi, type PodcastOverview } from './api/podcast.api';

export const podcastKey = ['podcast'] as const;

export function usePodcast() {
  return useQuery({
    queryKey: podcastKey,
    queryFn: podcastApi.overview,
    // Check back while episodes are still being made
    refetchInterval: (query) => ((query.state.data as PodcastOverview | undefined)?.episodes.some((e) => e.status === 'RUNNING') ? 4000 : false),
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: podcastKey }), queryClient.invalidateQueries({ queryKey: documentsKey })]);
}

export function useAddToPodcast() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: podcastApi.add, onSettled: invalidate });
}

export function useRemoveFromPodcast() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: podcastApi.remove, onSettled: invalidate });
}

export function useResetPodcastLink() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: podcastApi.resetLink, onSuccess: (data) => queryClient.setQueryData(podcastKey, data) });
}
