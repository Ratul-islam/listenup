import { router } from 'expo-router';
import { PenLine } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { useTokens } from '@/lib/use-tokens';

import type { Board, ContestView } from '../api/community.api';
import { BOARD_NAMES, monthName, PLACES, timeLeft } from '../lib/format';
import { prizeList } from './contest-card';

/** Every board's leaders, your entry, the rules, and last month's winners */
export function ContestSheet({
  contest,
  visible,
  initialBoard,
  onClose,
  onOpenItem,
}: {
  contest: ContestView | undefined;
  visible: boolean;
  initialBoard: Board;
  onClose: () => void;
  onOpenItem: (id: string) => void;
}) {
  return (
    <ActionSheet visible={visible && !!contest} onClose={onClose} title={contest ? `${monthName(contest.month)} writing contest` : undefined}>
      {contest && visible ? <Body contest={contest} initialBoard={initialBoard} onClose={onClose} onOpenItem={onOpenItem} /> : null}
    </ActionSheet>
  );
}

function Body({ contest, initialBoard, onClose, onOpenItem }: { contest: ContestView; initialBoard: Board; onClose: () => void; onOpenItem: (id: string) => void }) {
  const t = useTokens();
  const [board, setBoard] = useState<Board>(initialBoard);
  const leaders = contest.boards.find((b) => b.id === board)?.leaders ?? [];
  const last = contest.lastMonth;
  const prizes = contest.prizeMinutes;

  return (
    <ScrollView style={{ maxHeight: 560 }} contentContainerClassName="gap-5 pb-2">
      <Text variant="caption">{contest.theme ? `Theme: ${contest.theme} · ${timeLeft(contest.endsAt)}` : `Any topic · ${timeLeft(contest.endsAt)}`}</Text>

      <View className="gap-3">
        <Segmented<Board> options={(['bn', 'en', 'other'] as const).map((id) => ({ id, label: BOARD_NAMES[id] }))} value={board} onChange={setBoard} />
        {leaders.length ? (
          leaders.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => onOpenItem(l.id)}
              accessibilityRole="button"
              accessibilityLabel={`${PLACES[l.place]}: ${l.title} by ${l.penName}, ${l.hearts} hearts`}
              className="flex-row items-center gap-3 rounded-2xl px-1 py-1.5 active:bg-default"
            >
              <Text className={`w-6 text-center text-[16px] font-bold ${l.place <= prizes.length ? 'text-accent' : 'text-muted'}`}>{l.place}</Text>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold" numberOfLines={1}>{l.title}</Text>
                <Text variant="caption" numberOfLines={1}>{l.mine ? `${l.penName} (you)` : l.penName}</Text>
              </View>
              <Text variant="caption">♥ {l.hearts}</Text>
            </Pressable>
          ))
        ) : (
          <Text variant="caption" className="py-2">No entries here yet. Yours could be the first.</Text>
        )}
      </View>

      <View className="gap-2 rounded-2xl bg-surface-secondary p-4">
        {contest.entry ? (
          <>
            <Text variant="label">Your entry</Text>
            <Pressable onPress={() => onOpenItem(contest.entry!.id)} accessibilityRole="button" className="active:opacity-70">
              <Text className="text-[15px] font-semibold text-accent" numberOfLines={1}>{contest.entry.title}</Text>
            </Pressable>
            <Text variant="caption">♥ {contest.entry.hearts} in all. One entry a month, so this is it for {monthName(contest.month)}.</Text>
          </>
        ) : (
          <>
            <Text variant="label">Enter</Text>
            <Text variant="caption">
              Open something you wrote (on your Soundshelf or in Studio), tap ⋯, then Publish to Explore and tick the contest. One entry a month.
            </Text>
            <PrimaryButton
              label="Write something new"
              size="md"
              variant="secondary"
              icon={<PenLine size={17} color={t.foreground} />}
              onPress={() => {
                onClose();
                router.push('/script/new');
              }}
              className="mt-1"
            />
          </>
        )}
      </View>

      <View className="gap-1.5">
        <Text variant="label">How it works</Text>
        {[
          `Bangla, English and other languages each have a board. The top ${prizes.length} on each win ${prizeList(prizes)} Expressive minutes, given a day after the month ends. They never expire.`,
          `A heart counts once the listener has heard the writing (half of it, or 2 minutes), and their account has a confirmed email and is at least ${contest.voterMinDays} days old.`,
          `A winner needs at least ${contest.minHearts} hearts that count. Ties go to more hearts overall, then to whoever published first.`,
          'Everything is checked before it’s published, and pieces that break the community rules are taken out.',
        ].map((line) => (
          <View key={line} className="flex-row gap-2">
            <Text variant="caption">•</Text>
            <Text variant="caption" className="flex-1">{line}</Text>
          </View>
        ))}
        <Pressable
          onPress={() => {
            onClose();
            router.push('/legal/community');
          }}
          accessibilityRole="link"
          className="self-start py-1 active:opacity-70"
        >
          <Text className="text-[13px] font-semibold text-accent">Community rules</Text>
        </Pressable>
      </View>

      {last?.winners.length ? (
        <View className="gap-2">
          <Text variant="label">{monthName(last.month)} winners{last.theme ? ` · ${last.theme}` : ''}</Text>
          {last.winners.map((w) => (
            <Pressable
              key={`${w.board}:${w.place}`}
              onPress={() => w.publicationId && onOpenItem(w.publicationId)}
              disabled={!w.publicationId}
              accessibilityRole="button"
              className="flex-row items-center gap-3 rounded-2xl px-1 py-1 active:bg-default"
            >
              <Text className="w-10 text-[13px] font-bold text-accent">{PLACES[w.place]}</Text>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold" numberOfLines={1}>{w.title}</Text>
                <Text variant="caption" numberOfLines={1}>{`${w.penName} · ${BOARD_NAMES[w.board]} · ${w.minutes} min`}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
