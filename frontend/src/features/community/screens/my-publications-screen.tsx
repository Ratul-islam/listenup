import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Trophy } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { BookCover } from '@/features/explore/components/book-cover';
import { formatMinutes } from '@/features/player/hooks/use-player';
import { getErrorMessage } from '@/lib/api/api-error';
import { useTokens } from '@/lib/use-tokens';

import type { CommunityItem, PublicationStatus } from '../api/community.api';
import { PublicationSheet, type PublicationTarget } from '../components/publication-sheet';
import { useMyPublications, useRetryPublication, useUnpublish } from '../hooks';
import { monthName } from '../lib/format';
import { useClipPlayer } from '../lib/use-clip-player';

const STATUS: Record<PublicationStatus, { label: string; tone: 'accent' | 'muted' | 'danger' }> = {
  CHECKING: { label: 'Being checked', tone: 'muted' },
  LIVE: { label: 'In Explore', tone: 'accent' },
  HIDDEN: { label: 'Hidden for now', tone: 'danger' },
  REJECTED: { label: 'Not published', tone: 'danger' },
  REMOVED: { label: 'Taken down', tone: 'danger' },
  FAILED: { label: 'Not ready yet', tone: 'danger' },
};

/** Everything you've published: where each stands, its hearts and listens, and what to do about any that need you */
export default function MyPublicationsScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const mine = useMyPublications();
  const player = useClipPlayer();
  const [open, setOpen] = useState<PublicationTarget | null>(null);

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 16 }}>
        <ScreenHeader title="Your posts" onBack={router.back} />
        {mine.isPending ? (
          <Spinner color={t.accent} className="my-10 self-center" />
        ) : mine.isError ? (
          <InlineAlert message={getErrorMessage(mine.error)} />
        ) : !mine.data.length ? (
          <GlassCard className="gap-2 p-6">
            <Text variant="title">Nothing published yet</Text>
            <Text variant="caption">Open a story or poem you wrote, tap ⋯ and choose Publish to Explore. To post a line as a clip, tap it in the player.</Text>
          </GlassCard>
        ) : (
          mine.data.map((item) => <PostCard key={item.id} item={item} onOpen={() => setOpen({ id: item.id, item })} />)
        )}
      </ScrollView>
      <PublicationSheet target={open} player={player} onClose={() => setOpen(null)} />
    </CloudBackground>
  );
}

function PostCard({ item, onOpen }: { item: CommunityItem; onOpen: () => void }) {
  const t = useTokens();
  const { toast } = useToast();
  const retry = useRetryPublication();
  const remove = useUnpublish();
  const status = STATUS[item.status ?? 'CHECKING'];
  const live = item.status === 'LIVE';
  const fail = (e: unknown) => toast.show({ variant: 'danger', label: getErrorMessage(e) });

  return (
    <GlassCard className="gap-2.5 p-4" onPress={live ? onOpen : undefined} accessibilityLabel={live ? `${item.title}, open` : undefined}>
      <View className="flex-row items-center gap-2">
        {item.status === 'CHECKING' ? <Spinner size="sm" color={t.muted} /> : null}
        <Text className={`text-[13px] font-semibold ${status.tone === 'accent' ? 'text-accent' : status.tone === 'danger' ? 'text-danger' : 'text-muted'}`}>{status.label}</Text>
        <Text variant="caption">· {item.kind === 'clip' ? 'Clip' : 'Writing'}</Text>
        {item.contestMonth ? (
          <View className="ml-auto flex-row items-center gap-1">
            <Trophy size={13} color={t.accent} />
            <Text className="text-[12px] font-semibold text-accent">{monthName(item.contestMonth)}</Text>
          </View>
        ) : null}
      </View>
      <View className="flex-row items-center gap-3">
        {item.kind === 'writing' ? <BookCover item={{ id: item.id, title: item.title, author: item.penName }} width={44} imageUrl={item.coverUrl} /> : null}
        <View className="flex-1 gap-1">
          <Text className="text-[16px] font-semibold" numberOfLines={2}>
            {item.kind === 'clip' ? `“${item.text?.trim()}”` : item.title}
          </Text>
          {live ? (
            <Text variant="caption">{`♥ ${item.hearts} · ${item.listens} ${item.kind === 'clip' ? 'plays' : `listener${item.listens === 1 ? '' : 's'}`} · ${formatMinutes(item.durationSec)}`}</Text>
          ) : item.status === 'CHECKING' ? (
            <Text variant="caption">{item.kind === 'writing' ? 'Checking it and finishing its audio. This takes a few minutes.' : 'Checking it. This takes a moment.'}</Text>
          ) : null}
        </View>
      </View>
      {/* Why it isn't in Explore, or (on one that is) why it went in without its cover picture */}
      {item.statusNote && item.status !== 'CHECKING' ? <Text variant="caption">{item.statusNote}</Text> : null}
      {!live && item.status !== 'CHECKING' ? (
        <View className="flex-row gap-2 pt-1">
          {item.status === 'FAILED' ? (
            <Action label="Try again" busy={retry.isPending} onPress={() => retry.mutate(item.id, { onError: fail })} />
          ) : null}
          <Action label={item.status === 'HIDDEN' ? 'Unpublish' : 'Remove'} danger busy={remove.isPending} onPress={() => remove.mutate(item.id, { onError: fail })} />
        </View>
      ) : null}
    </GlassCard>
  );
}

function Action({ label, onPress, busy, danger }: { label: string; onPress: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" className={`rounded-full bg-surface-secondary px-4 py-2 active:opacity-70 ${busy ? 'opacity-50' : ''}`}>
      <Text className={`text-[14px] font-semibold ${danger ? 'text-danger' : 'text-accent'}`}>{label}</Text>
    </Pressable>
  );
}
