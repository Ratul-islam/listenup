import { ChevronRight, Trophy } from 'lucide-react-native';
import { View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { Text } from '@/components/ui/text';
import { useTokens } from '@/lib/use-tokens';

import type { Board, ContestView, Leader } from '../api/community.api';
import { BOARD_NAMES, monthName, timeLeft } from '../lib/format';

/** The prizes in a sentence: "60, 30 or 15" */
export const prizeList = (minutes: number[]) => `${minutes.slice(0, -1).join(', ')} or ${minutes[minutes.length - 1]}`;

/**
 * This month's contest on Explore: theme, time left, the prizes, and the
 * leaders on the board for the language shown (each board's leader for "All").
 * Tap for every board and the rules.
 */
export function ContestCard({ contest, board, onOpen }: { contest: ContestView; board: Board | 'all'; onOpen: () => void }) {
  const t = useTokens();
  const leaders: (Leader & { board?: Board })[] =
    board === 'all'
      ? contest.boards.flatMap((b) => (b.leaders[0] ? [{ ...b.leaders[0], board: b.id }] : []))
      : (contest.boards.find((b) => b.id === board)?.leaders.slice(0, 3) ?? []);

  return (
    <GlassCard className="gap-3.5 p-5" onPress={onOpen} accessibilityLabel={`${monthName(contest.month)} writing contest. See the boards and rules`}>
      <View className="flex-row items-center gap-3">
        <View className="size-11 items-center justify-center rounded-full bg-accent-soft-bg">
          <Trophy size={21} color={t.accent} />
        </View>
        <View className="flex-1">
          <Text variant="title">{monthName(contest.month)} writing contest</Text>
          <Text variant="caption">{contest.theme ? `Theme: ${contest.theme} · ${timeLeft(contest.endsAt)}` : timeLeft(contest.endsAt)}</Text>
        </View>
      </View>
      <Text className="text-[15px] leading-[22px] text-muted">
        Publish something you wrote and enter it. The top 3 in each language win {prizeList(contest.prizeMinutes)} Expressive minutes.
      </Text>
      {leaders.length ? (
        <View className="gap-2.5 border-t border-separator pt-3">
          {leaders.map((l) => (
            <View key={l.id} className="flex-row items-center gap-3">
              <Text className="w-5 text-center text-[15px] font-bold text-accent">{l.place}</Text>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold" numberOfLines={1}>{l.title}</Text>
                <Text variant="caption" numberOfLines={1}>{l.board ? `${l.penName} · ${BOARD_NAMES[l.board]}` : l.penName}</Text>
              </View>
              <Text variant="caption">♥ {l.hearts}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View className="flex-row items-center gap-0.5">
        <Text className="text-[14px] font-semibold text-accent">{leaders.length ? 'See every board and the rules' : 'How it works'}</Text>
        <ChevronRight size={16} color={t.accent} />
      </View>
    </GlassCard>
  );
}
