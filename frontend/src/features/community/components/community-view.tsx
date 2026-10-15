import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { ChevronRight, PartyPopper } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { BookCover } from '@/features/explore/components/book-cover';
import { formatMinutes } from '@/features/player/hooks/use-player';
import { getErrorMessage } from '@/lib/api/api-error';
import type { Lang } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import type { CommunityItem } from '../api/community.api';
import { useCommunityFeed, useContest, useHeart, useMyPublications, useWinsSeen } from '../hooks';
import { boardOf, monthName, PLACES } from '../lib/format';
import { useClipPlayer } from '../lib/use-clip-player';
import { CLIP_WIDTH, ClipCard } from './clip-card';
import { ContestCard } from './contest-card';
import { ContestSheet } from './contest-sheet';
import { HeartButton } from './heart-button';
import { PublicationSheet, type PublicationTarget } from './publication-sheet';

const PAGE_MARGIN = 20;
const COVER_GAP = 16;

/** Languages with something in the Community, for Explore's language chips (once it's open) */
export function useCommunityLanguages(enabled: boolean) {
  const writings = useCommunityFeed('writing', enabled);
  const clips = useCommunityFeed('clip', enabled);
  return useMemo(() => {
    const all = [...(writings.data?.pages ?? []), ...(clips.data?.pages ?? [])].flatMap((p) => p.items);
    return [...new Set(all.map((i) => i.language))].filter((l): l is Lang => l !== 'mixed');
  }, [writings.data, clips.data]);
}

/**
 * Explore's Community: this month's contest, prizes you've won, your own
 * posts, voice clips to tap and hear, and the newest writings.
 */
export function CommunityView({ filter }: { filter: Lang | 'all' }) {
  const t = useTokens();
  const { toast } = useToast();
  const writings = useCommunityFeed('writing');
  const clips = useCommunityFeed('clip');
  const contest = useContest();
  const mine = useMyPublications();
  const heart = useHeart();
  const player = useClipPlayer();
  const [open, setOpen] = useState<PublicationTarget | null>(null);
  const [contestOpen, setContestOpen] = useState(false);

  const show = (items: CommunityItem[]) => items.filter((i) => filter === 'all' || i.language === filter);
  const writingItems = show(writings.data?.pages.flatMap((p) => p.items) ?? []);
  const clipItems = show(clips.data?.pages.flatMap((p) => p.items) ?? []);
  const board = filter === 'all' ? 'all' : boardOf(filter);
  // Two covers to a row, inside the page's side margins
  const coverWidth = Math.floor((useWindowDimensions().width - 2 * PAGE_MARGIN - COVER_GAP) / 2);

  // Clips are hearted right on their card; a writing is hearted from its sheet or the player, once heard
  const toggleHeart = (item: CommunityItem) =>
    heart.mutate({ id: item.id, on: !item.hearted }, { onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }) });

  if (writings.isPending || clips.isPending) return <Spinner color={t.accent} className="my-10 self-center" />;
  if (writings.isError) {
    return (
      <View className="gap-3">
        <InlineAlert message={getErrorMessage(writings.error)} />
        <PrimaryButton label="Try again" variant="secondary" onPress={() => void writings.refetch()} />
      </View>
    );
  }

  const posts = mine.data ?? [];
  const checking = posts.filter((p) => p.status === 'CHECKING').length;
  const live = posts.filter((p) => p.status === 'LIVE').length;
  const needsYou = posts.filter((p) => p.status === 'FAILED' || p.status === 'REJECTED' || p.status === 'HIDDEN').length;

  return (
    <>
      {contest.data?.wins.length ? <WinNotice wins={contest.data.wins} /> : null}

      {contest.data ? <ContestCard contest={contest.data} board={board} onOpen={() => setContestOpen(true)} /> : null}

      {posts.length ? (
        <GlassCard onPress={() => router.push('/community/mine')} className="flex-row items-center gap-3 px-4 py-3.5" accessibilityLabel="Your posts">
          <View className="flex-1">
            <Text className="text-[16px] font-semibold">Your posts</Text>
            <Text variant="caption">
              {[live && `${live} in Explore`, checking && `${checking} being checked`, needsYou && `${needsYou} need${needsYou === 1 ? 's' : ''} a look`].filter(Boolean).join(' · ') || 'None in Explore right now'}
            </Text>
          </View>
          <ChevronRight size={18} color={t.muted} />
        </GlassCard>
      ) : null}

      {clipItems.length ? (
        <View className="gap-3">
          <SectionTitle title="Voice clips" detail="A line or two, tap to hear" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerClassName="gap-3 px-5 pb-2" snapToInterval={CLIP_WIDTH + 12} decelerationRate="fast">
            {clipItems.map((item) => (
              <ClipCard key={item.id} item={item} player={player} onHeart={() => toggleHeart(item)} onMore={() => setOpen({ id: item.id, item })} />
            ))}
            {clips.hasNextPage ? (
              <Pressable onPress={() => void clips.fetchNextPage()} accessibilityRole="button" className="w-24 items-center justify-center active:opacity-70">
                {clips.isFetchingNextPage ? <Spinner size="sm" color={t.accent} /> : <Text className="text-[14px] font-semibold text-accent">More</Text>}
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      {writingItems.length ? (
        <View className="gap-3">
          <SectionTitle title="New writing" detail="From listeners like you" />
          <View className="flex-row flex-wrap" style={{ columnGap: COVER_GAP, rowGap: 20 }}>
            {writingItems.map((item) => (
              <WritingCard key={item.id} item={item} width={coverWidth} onPress={() => setOpen({ id: item.id, item })} />
            ))}
          </View>
          {writings.hasNextPage ? (
            <PrimaryButton label="Show more" variant="secondary" size="md" isLoading={writings.isFetchingNextPage} onPress={() => void writings.fetchNextPage()} />
          ) : null}
        </View>
      ) : null}

      {!writingItems.length && !clipItems.length ? (
        <GlassCard className="items-center gap-2 p-6">
          <Text variant="title" className="text-center">Nothing here yet</Text>
          <Text variant="caption" className="text-center">
            Be the first: open a story or poem you wrote, tap ⋯ and choose Publish to Explore. Or post a favourite line from a classic as a clip.
          </Text>
        </GlassCard>
      ) : null}

      <PublicationSheet target={open} player={player} onClose={() => setOpen(null)} />
      <ContestSheet
        contest={contest.data}
        visible={contestOpen}
        initialBoard={board === 'all' ? 'bn' : board}
        onClose={() => setContestOpen(false)}
        onOpenItem={(id) => {
          setContestOpen(false);
          setOpen({ id });
        }}
      />
    </>
  );
}

/** One writing: its cover (the writer's picture, or a drawn one), then its title, who wrote it, how long, and its hearts */
function WritingCard({ item, width, onPress }: { item: CommunityItem; width: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title} by ${item.penName}, ${formatMinutes(item.durationSec)}, ${item.hearts} hearts${item.documentId ? ', on your shelf' : ''}`}
      className="gap-2 active:opacity-80"
      style={{ width }}
    >
      <BookCover item={{ id: item.id, title: item.title, author: item.penName }} width={width} added={!!item.documentId} imageUrl={item.coverUrl} />
      <View className="gap-0.5 px-0.5">
        <Text className="text-[15px] font-semibold leading-5" numberOfLines={2}>{item.title}</Text>
        <View className="flex-row items-center gap-2">
          <Text variant="caption" className="flex-1" numberOfLines={1}>{`${item.penName}, ${formatMinutes(item.durationSec)}`}</Text>
          <HeartButton hearts={item.hearts} hearted={item.hearted} />
        </View>
      </View>
    </Pressable>
  );
}

/** "You came 1st!" once, after a contest month ends */
function WinNotice({ wins }: { wins: { id: string; month: string; place: number; title: string; minutes: number }[] }) {
  const t = useTokens();
  const seen = useWinsSeen();
  const minutes = wins.reduce((n, w) => n + w.minutes, 0);
  const first = wins[0];
  return (
    <GlassCard className="gap-3 p-5" raised>
      <View className="flex-row items-center gap-3">
        <View className="size-11 items-center justify-center rounded-full bg-accent-soft-bg">
          <PartyPopper size={21} color={t.accent} />
        </View>
        <Text variant="title" className="flex-1">
          You came {PLACES[first.place]} in {monthName(first.month)}’s contest!
        </Text>
      </View>
      <Text className="text-[15px] leading-[22px] text-muted">
        Listeners loved “{first.title}”. {minutes} Expressive minutes are now yours, and they never expire.
      </Text>
      <PrimaryButton label="Lovely" size="md" isLoading={seen.isPending} onPress={() => seen.mutate()} />
    </GlassCard>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <View className="flex-row items-baseline gap-2 px-1">
      <Text variant="label">{title}</Text>
      <Text variant="caption">{detail}</Text>
    </View>
  );
}
