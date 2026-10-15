import { useQueryClient } from '@tanstack/react-query';
import { Spinner } from 'heroui-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Segmented } from '@/components/ui/segmented';
import { ChoiceChips } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { CommunityView, useCommunityLanguages } from '@/features/community/components/community-view';
import { communityKey } from '@/features/community/hooks';
import { formatMinutes } from '@/features/player/hooks/use-player';
import { usePlayerStore } from '@/features/player/store/player.store';
import { getErrorMessage } from '@/lib/api/api-error';
import { LANGS, LANGUAGE_NAMES, type Lang } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import type { CatalogItem } from '../api/catalog.api';
import { BookCover } from '../components/book-cover';
import { TitleRow, TitleSheet } from '../components/title-sheet';
import { VoicesRow } from '../components/voices-row';
import { useCatalog } from '../hooks/use-catalog';

// Up to this long is a "short listen": one sitting
const SHORT_MINUTES = 60;
const SHORT_COVER = 128;

type Filter = Lang | 'all';
type Shelf = 'classics' | 'community';

/**
 * Explore: free classics to listen to, short ones first, in the listener's
 * languages. Like the shelf, it opens straight on its content: the Classics
 * and Community switch is the top of the page. Tap one for what it's about and a single "Listen", which puts it
 * on the shelf and plays it. The voices come last, to hear them. "Community"
 * holds what listeners publish themselves, and the monthly writing contest.
 */
export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const client = useQueryClient();
  const catalog = useCatalog();
  const hasPlayer = usePlayerStore((s) => !!s.documentId);
  const [shelf, setShelf] = useState<Shelf>('classics');
  const communityLanguages = useCommunityLanguages(shelf === 'community');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<CatalogItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const all = useMemo(() => catalog.data ?? [], [catalog.data]);
  const catalogLanguages = useMemo(() => LANGS.filter((l) => all.some((i) => i.language === l)), [all]);
  const languages = shelf === 'classics' ? catalogLanguages : LANGS.filter((l) => communityLanguages.includes(l));
  const items = all.filter((i) => filter === 'all' || i.language === filter);
  const short = items.filter((i) => i.minutes <= SHORT_MINUTES);
  const books = items.filter((i) => i.minutes > SHORT_MINUTES);

  const refresh = async () => {
    setRefreshing(true);
    await (shelf === 'classics' ? catalog.refetch() : client.invalidateQueries({ queryKey: communityKey })).finally(() => setRefreshing(false));
  };
  const switchShelf = (next: Shelf) => {
    setShelf(next);
    // A language with nothing on the other shelf would show it empty
    if (filter !== 'all' && !(next === 'classics' ? catalogLanguages : communityLanguages).includes(filter)) setFilter('all');
  };

  return (
    <CloudBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + (hasPlayer ? 190 : 120), paddingHorizontal: 20, gap: 22 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={t.accent} colors={[t.accent]} />}
      >
        <Segmented<Shelf>
          options={[
            { id: 'classics', label: 'Classics' },
            { id: 'community', label: 'Community' },
          ]}
          value={shelf}
          onChange={switchShelf}
        />

        {languages.length > 1 ? (
          <View className="-mx-3 -my-3">
            <ChoiceChips<Filter> options={['all', ...languages]} value={filter} format={(v) => (v === 'all' ? 'All' : LANGUAGE_NAMES[v])} onChange={setFilter} />
          </View>
        ) : null}

        {shelf === 'community' ? (
          <CommunityView filter={filter} />
        ) : catalog.isPending ? (
          <Spinner color={t.accent} className="my-10 self-center" />
        ) : catalog.isError ? (
          <View className="gap-3">
            <InlineAlert message={getErrorMessage(catalog.error)} />
            <PrimaryButton label="Try again" variant="secondary" onPress={() => void catalog.refetch()} />
          </View>
        ) : (
          <>
            {short.length ? (
              <View className="gap-3">
                <SectionTitle title="Short listens" detail="Under an hour" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerClassName="gap-4 px-5 pb-2">
                  {short.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => setOpen(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.englishTitle ?? item.title}, ${item.author}, ${formatMinutes(item.minutes * 60)}${item.documentId ? ', on your shelf' : ''}`}
                      className="gap-2 active:opacity-80"
                      style={{ width: SHORT_COVER }}
                    >
                      <BookCover item={item} width={SHORT_COVER} added={!!item.documentId} />
                      <View className="gap-0.5 px-0.5">
                        <Text className="text-[14px] font-semibold" numberOfLines={1}>{item.englishTitle ?? item.title}</Text>
                        <Text variant="caption">{formatMinutes(item.minutes * 60)}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {books.length ? (
              <View className="gap-3">
                <SectionTitle title="Books" detail="To come back to" />
                <GlassCard className="p-2">
                  {books.map((item) => (
                    <TitleRow key={item.id} item={item} onPress={() => setOpen(item)} />
                  ))}
                </GlassCard>
              </View>
            ) : null}
          </>
        )}

        {shelf === 'classics' ? <VoicesRow languages={filter === 'all' ? languages : [filter]} /> : null}
      </ScrollView>

      <TitleSheet item={open} onClose={() => setOpen(null)} />
    </CloudBackground>
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
