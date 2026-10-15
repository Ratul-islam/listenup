import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { BookCover } from '@/features/explore/components/book-cover';
import { getErrorMessage } from '@/lib/api/api-error';
import { useTokens } from '@/lib/use-tokens';

import type { ReviewItem } from '../api/community.api';
import { useContest, useReview, useReviewQueue, useSetTheme } from '../hooks';
import { monthName } from '../lib/format';

/**
 * For the ListenUp team: this month's contest theme, and pieces to look at
 * (hidden after reports, or turned down by the AI check). Restore puts one in
 * Explore; Remove takes it off everyone's shelf and tells the writer.
 */
export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const queue = useReviewQueue();

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Community review" onBack={router.back} />
        <ThemeCard />
        <Text variant="label" className="px-1 text-muted">To look at</Text>
        {queue.isPending ? (
          <Spinner color={t.accent} className="my-6 self-center" />
        ) : queue.isError ? (
          <InlineAlert message={getErrorMessage(queue.error)} />
        ) : !queue.data.length ? (
          <Text variant="caption" className="px-1">Nothing waiting. Reported pieces, and ones the AI check turned down in the last 30 days, show here.</Text>
        ) : (
          queue.data.map((item) => <ReviewCard key={item.id} item={item} />)
        )}
      </ScrollView>
    </CloudBackground>
  );
}

function ThemeCard() {
  const t = useTokens();
  const { toast } = useToast();
  const contest = useContest();
  const setTheme = useSetTheme();
  const [theme, setThemeText] = useState<string | null>(null);
  if (!contest.data) return null;
  const value = theme ?? contest.data.theme ?? '';
  return (
    <GlassCard className="gap-3 p-5">
      <Text variant="title">{monthName(contest.data.month)} theme</Text>
      <TextInput
        value={value}
        onChangeText={setThemeText}
        placeholder="Any topic"
        placeholderTextColor={t.muted}
        maxLength={80}
        accessibilityLabel="Contest theme"
        className="rounded-2xl border border-field-border bg-field px-4 py-3 font-sans text-[16px] text-foreground"
      />
      <PrimaryButton
        label="Save theme"
        size="md"
        isLoading={setTheme.isPending}
        isDisabled={value.trim() === (contest.data.theme ?? '')}
        onPress={() =>
          setTheme.mutate(
            { month: contest.data!.month, theme: value.trim() || null },
            { onSuccess: () => toast.show({ label: 'Theme saved' }), onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }) },
          )
        }
      />
    </GlassCard>
  );
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const { toast } = useToast();
  const review = useReview();
  const [full, setFull] = useState(false);
  const reasons = Object.entries(item.reports.reduce<Record<string, number>>((n, r) => ({ ...n, [r.reason]: (n[r.reason] ?? 0) + 1 }), {}));
  const act = (action: 'restore' | 'remove') =>
    review.mutate({ id: item.id, action }, { onSuccess: () => toast.show({ label: action === 'restore' ? 'Restored' : 'Taken down' }), onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }) });

  return (
    <GlassCard className="gap-2.5 p-4">
      <Text className="text-[13px] font-semibold text-danger">
        {item.status === 'HIDDEN' ? `Reported: ${reasons.map(([r, c]) => `${r} ×${c}`).join(', ')}` : `Turned down by the check: ${item.statusNote ?? ''}`}
      </Text>
      <View className="flex-row items-center gap-3">
        {/* The writer's own picture: part of what's being reviewed */}
        {item.coverUrl ? <BookCover item={{ id: item.id, title: item.title, author: item.penName ?? '' }} width={72} imageUrl={item.coverUrl} /> : null}
        <View className="flex-1 gap-1">
          <Text className="text-[16px] font-semibold">{item.title}</Text>
          <Text variant="caption">{`${item.kind === 'clip' ? 'Clip' : 'Writing'} · ${item.penName ?? 'No pen name'} · ${item.email}`}</Text>
        </View>
      </View>
      {item.reports.some((r) => r.note) ? (
        <View className="gap-1">
          {item.reports.filter((r) => r.note).map((r) => (
            <Text key={r.createdAt} variant="caption">“{r.note}”</Text>
          ))}
        </View>
      ) : null}
      <Pressable onPress={() => setFull(!full)} accessibilityRole="button" className="rounded-xl bg-surface-secondary p-3 active:opacity-80">
        <Text className="text-[14px] leading-[21px]" numberOfLines={full ? undefined : 8}>{item.text}</Text>
      </Pressable>
      <View className="flex-row gap-2 pt-1">
        <PrimaryButton label={item.status === 'HIDDEN' ? 'Restore' : 'Publish it'} size="md" variant="secondary" isDisabled={review.isPending} onPress={() => act('restore')} className="flex-1" />
        <Pressable onPress={() => act('remove')} disabled={review.isPending} accessibilityRole="button" className="h-12 flex-1 items-center justify-center rounded-full bg-danger active:opacity-85">
          <Text className="text-[15px] font-semibold text-danger-foreground">Remove</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}
