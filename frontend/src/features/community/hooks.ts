import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';

import { communityApi, type CommunityDetail, type CommunityItem, type PublishBody, type ReportReason } from './api/community.api';

type FeedPage = { items: CommunityItem[]; next: string | null };

export const communityKey = ['community'] as const;
const feedKey = (kind: 'writing' | 'clip') => [...communityKey, 'feed', kind] as const;
const detailKey = (id: string) => [...communityKey, 'item', id] as const;
const contestKey = [...communityKey, 'contest'] as const;
const mineKey = [...communityKey, 'mine'] as const;
const profileKey = [...communityKey, 'profile'] as const;
const blocksKey = [...communityKey, 'blocks'] as const;
const reviewKey = [...communityKey, 'review'] as const;

/** Newest writings or clips, a page at a time */
export function useCommunityFeed(kind: 'writing' | 'clip', enabled = true) {
  return useInfiniteQuery({
    queryKey: feedKey(kind),
    queryFn: ({ pageParam }) => communityApi.feed(kind, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
    staleTime: 30_000,
    enabled,
  });
}

export function usePublication(id: string | null) {
  return useQuery({ queryKey: detailKey(id ?? ''), queryFn: () => communityApi.get(id!), enabled: !!id });
}

export function useContest() {
  return useQuery({ queryKey: contestKey, queryFn: communityApi.contest, staleTime: 60_000 });
}

/** The viewer's own publications; refreshed while any is still being checked */
export function useMyPublications() {
  return useQuery({
    queryKey: mineKey,
    queryFn: communityApi.mine,
    refetchInterval: (q) => (q.state.data?.some((p) => p.status === 'CHECKING') ? 5000 : false),
  });
}

export function useCommunityProfile() {
  return useQuery({ queryKey: profileKey, queryFn: communityApi.profile, staleTime: 5 * 60_000 });
}

export function usePublishPreview(documentId: string, voiceId?: string) {
  // Changing the voice keeps the form showing while its cost is worked out
  return useQuery({ queryKey: [...communityKey, 'preview', documentId, voiceId ?? null], queryFn: () => communityApi.preview(documentId, voiceId), placeholderData: keepPreviousData });
}

export function useBlocks(enabled: boolean) {
  return useQuery({ queryKey: blocksKey, queryFn: communityApi.blocks, enabled });
}

export function useReviewQueue() {
  return useQuery({ queryKey: reviewKey, queryFn: communityApi.reviewQueue });
}

const refreshAll = (client: QueryClient) => client.invalidateQueries({ queryKey: communityKey });

/** Applies a change to an item wherever it's cached: feeds, the detail, the writer's list */
function patchItem(client: QueryClient, id: string, patch: (item: CommunityItem) => CommunityItem) {
  for (const kind of ['writing', 'clip'] as const) {
    client.setQueryData<InfiniteData<FeedPage>>(feedKey(kind), (data) =>
      data && { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? patch(i) : i)) })) },
    );
  }
  client.setQueryData<CommunityDetail>(detailKey(id), (d) => d && { ...d, ...patch(d) });
  client.setQueryData<CommunityItem[]>(mineKey, (items) => items?.map((i) => (i.id === id ? patch(i) : i)));
}

export function usePublish() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: PublishBody) => communityApi.publish(body),
    onSuccess: () => {
      void refreshAll(client);
      // A clip, or the rest of a writing's audio, comes out of the writer's minutes
      void client.invalidateQueries({ queryKey: ['usage'] });
    },
  });
}

export function useUnpublish() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: communityApi.unpublish,
    onSettled: () => {
      void refreshAll(client);
      void client.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useRetryPublication() {
  const client = useQueryClient();
  return useMutation({ mutationFn: communityApi.retry, onSettled: () => void refreshAll(client) });
}

/** Hearts or un-hearts at once, then settles on the server's count */
export function useHeart() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => (on ? communityApi.heart(id) : communityApi.unheart(id)),
    onMutate: ({ id, on }) => patchItem(client, id, (i) => (i.hearted === on ? i : { ...i, hearted: on, hearts: Math.max(0, i.hearts + (on ? 1 : -1)) })),
    onSuccess: ({ hearts }, { id, on }) => patchItem(client, id, (i) => ({ ...i, hearted: on, hearts })),
    onError: (_e, { id, on }) => patchItem(client, id, (i) => ({ ...i, hearted: !on, hearts: Math.max(0, i.hearts + (on ? -1 : 1)) })),
    onSettled: () => void client.invalidateQueries({ queryKey: contestKey }),
  });
}

export function useReport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, note }: { id: string; reason: ReportReason; note?: string }) => communityApi.report(id, reason, note),
    // Reported pieces leave the reporter's Explore
    onSuccess: () => void refreshAll(client),
  });
}

export function useBlockWriter() {
  const client = useQueryClient();
  return useMutation({ mutationFn: communityApi.blockWriter, onSuccess: () => void refreshAll(client) });
}

export function useUnblock() {
  const client = useQueryClient();
  return useMutation({ mutationFn: communityApi.unblock, onSuccess: () => void refreshAll(client) });
}

export function useSetPenName() {
  const client = useQueryClient();
  return useMutation({ mutationFn: communityApi.setPenName, onSuccess: (profile) => client.setQueryData(profileKey, profile) });
}

export function useWinsSeen() {
  const client = useQueryClient();
  return useMutation({ mutationFn: communityApi.winsSeen, onSuccess: () => void client.invalidateQueries({ queryKey: contestKey }) });
}

export function useReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'restore' | 'remove'; note?: string }) => communityApi.review(id, action, note),
    onSettled: () => void refreshAll(client),
  });
}

export function useSetTheme() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ month, theme }: { month: string; theme: string | null }) => communityApi.setTheme(month, theme),
    onSettled: () => void client.invalidateQueries({ queryKey: contestKey }),
  });
}

export { refreshAll as refreshCommunity };
