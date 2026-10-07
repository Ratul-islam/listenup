import { router } from 'expo-router';
import { Avatar, Spinner } from 'heroui-native';
import { ChevronRight, Ellipsis, Plus, SpellCheck2, Timer } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { IconTile } from '@/components/ui/icon-tile';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SettingsRow, SettingsSection } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { formatTimeLeft } from '@/features/account/lib/allowance';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { DocumentActions } from '@/features/library/components/document-actions';
import type { DocumentSummary } from '@/features/library/types';
import { usePlayerStore } from '@/features/player/store/player.store';
import { usePronunciations } from '@/features/pronunciations/hooks';
import { useUsage } from '@/features/voices/hooks/use-voices';
import { initials } from '@/features/voices/voice-catalog';
import { useTokens } from '@/lib/use-tokens';

import { useScripts } from '../hooks/use-scripts';
import { formatClock } from '../lib/time';

/** Studio: a creator's scripts, turned into voiceovers part by part */
export default function StudioScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const user = useAuthStore((s) => s.user);
  const hasPlayer = usePlayerStore((s) => !!s.documentId);
  const scripts = useScripts();
  const pronunciations = usePronunciations();
  const usage = useUsage();
  const [actionsFor, setActionsFor] = useState<DocumentSummary | null>(null);
  const items = scripts.data?.items ?? [];
  const expressive = usage.data?.expressive;
  const natural = usage.data?.natural;

  const header = (
    <View className="gap-5 pb-3">
      <View className="flex-row items-center justify-between" style={{ paddingTop: insets.top + 16 }}>
        <View className="gap-0.5">
          <Text variant="caption" className="text-[14px]">Voiceovers from your scripts</Text>
          <Text variant="h1" accessibilityRole="header">Studio</Text>
        </View>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile and settings" hitSlop={6}>
          <Avatar size="md" alt={user?.name ?? user?.email ?? 'Account'}>
            {user?.avatarUrl ? <Avatar.Image source={{ uri: user.avatarUrl }} /> : null}
            <Avatar.Fallback>{initials(user?.name ?? user?.email ?? '?')}</Avatar.Fallback>
          </Avatar>
        </Pressable>
      </View>

      <GlassCard raised onPress={() => router.push('/script/new')} accessibilityLabel="New script" className="flex-row items-center gap-3.5 p-4">
        <IconTile size={48}>
          <Plus size={22} color={t.accent} />
        </IconTile>
        <View className="flex-1 gap-0.5">
          <Text className="text-[17px] font-semibold">New script</Text>
          <Text variant="caption">Paste it all, however long. It’s split into parts for you.</Text>
        </View>
      </GlassCard>

      <GlassCard onPress={() => router.push('/plans')} accessibilityLabel="Studio time left. See plans" className="gap-3 p-4">
        <View className="flex-row items-center gap-2">
          <Timer size={17} color={t.accent} />
          <Text className="flex-1 text-[15px] font-semibold">Studio time</Text>
          <ChevronRight size={16} color={t.muted} />
        </View>
        <Meter label={expressive?.trial ? 'Expressive (trial)' : 'Expressive'} used={expressive?.usedSec} limit={expressive?.limitSec} left={expressive?.remainingSec} />
        <Meter label="Natural" used={natural?.usedSec} limit={natural?.limitSec} left={natural?.remainingSec} />
        <Text variant="caption">Audio already voiced replays and re-exports for free.</Text>
      </GlassCard>

      <SettingsSection>
        <SettingsRow
          icon={<SpellCheck2 size={19} color={t.foreground} />}
          label="Pronunciations"
          detail="Names and words the voices should say your way"
          value={pronunciations.data?.length ? String(pronunciations.data.length) : undefined}
          onPress={() => router.push('/pronunciations')}
        />
      </SettingsSection>

      {items.length ? <Text variant="label" className="px-1 pt-1 text-muted">Your scripts</Text> : null}
    </View>
  );

  return (
    <CloudBackground>
      <FlatList
        data={items}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + (hasPlayer ? 190 : 120), gap: 10 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <ScriptRow script={item} onMore={setActionsFor} />}
        ListEmptyComponent={
          scripts.isPending ? (
            <Spinner color={t.accent} className="my-8 self-center" />
          ) : (
            <View className="items-center gap-2 px-6 pt-8">
              <Text className="text-center text-[16px] font-semibold">No scripts yet</Text>
              <Text variant="caption" className="text-center">
                Fix one line later and only that line is voiced again. The rest of your recording is reused, so retakes cost almost nothing.
              </Text>
            </View>
          )
        }
      />
      <DocumentActions document={actionsFor} onClose={() => setActionsFor(null)} />
    </CloudBackground>
  );
}

/** A script as a session: its length as a timecode, its parts, when it was last worked on */
function ScriptRow({ script, onMore }: { script: DocumentSummary; onMore: (d: DocumentSummary) => void }) {
  const t = useTokens();
  const preparing = script.status === 'PENDING' || script.status === 'PROCESSING';
  const failed = script.status === 'FAILED';
  const detail = preparing
    ? 'Splitting into parts…'
    : failed
      ? (script.error ?? 'Couldn’t read this script')
      : `${script.chunkCount === 1 ? '1 part' : `${script.chunkCount} parts`}, ${sinceLabel(script.editedAt ?? script.updatedAt)}`;
  return (
    <GlassCard
      onPress={() => (script.status === 'READY' ? router.push({ pathname: '/script/[id]', params: { id: script.id } }) : onMore(script))}
      accessibilityLabel={`${script.title}, ${formatClock(script.estimatedDurationSec)} long, ${detail}`}
      className="flex-row items-center gap-3.5 p-4"
    >
      <View className="h-12 w-[68px] items-center justify-center rounded-2xl bg-accent-soft-bg">
        {preparing ? (
          <Spinner size="sm" color={t.accent} />
        ) : (
          <Text className="text-[15px] font-bold text-accent-soft-fg" style={{ fontVariant: ['tabular-nums'] }}>{formatClock(script.estimatedDurationSec)}</Text>
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-[16px] font-semibold" numberOfLines={1}>{script.title}</Text>
        <Text variant="caption" numberOfLines={1} className={failed ? 'text-danger' : undefined}>{detail}</Text>
      </View>
      <Pressable onPress={() => onMore(script)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`More for ${script.title}`} className="size-9 items-center justify-center rounded-full active:bg-default">
        <Ellipsis size={18} color={t.muted} />
      </Pressable>
    </GlassCard>
  );
}

/** "edited just now", "edited 3 h ago", "edited 2 Oct" */
function sinceLabel(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return 'edited just now';
  if (minutes < 60) return `edited ${minutes} min ago`;
  if (minutes < 24 * 60) return `edited ${Math.floor(minutes / 60)} h ago`;
  return `edited ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/** Minutes left of one voice level, as a slim meter */
function Meter({ label, used, limit, left }: { label: string; used?: number; limit?: number; left?: number }) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[14px]">{label}</Text>
        <Text variant="caption" style={{ fontVariant: ['tabular-nums'] }}>{left != null ? `${formatTimeLeft(left)} left` : '…'}</Text>
      </View>
      <ProgressBar value={used != null && limit ? 1 - Math.min(used / limit, 1) : 0} />
    </View>
  );
}
