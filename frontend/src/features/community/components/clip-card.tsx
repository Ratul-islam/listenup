import { Spinner } from 'heroui-native';
import { MoreHorizontal, Pause, Play } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { Text } from '@/components/ui/text';
import { isRtl } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import type { CommunityItem } from '../api/community.api';
import { clipCredit } from '../lib/format';
import type { ClipPlayer } from '../lib/use-clip-player';
import { HeartButton } from './heart-button';

export const CLIP_WIDTH = 264;

/** A voice clip: the words, who they're from, ▶ to hear it, ♥, and ⋯ for more */
export function ClipCard({ item, player, onHeart, onMore }: { item: CommunityItem; player: ClipPlayer; onHeart: () => void; onMore: () => void }) {
  const t = useTokens();
  const playing = player.playingId === item.id;
  const loading = player.loadingId === item.id;
  return (
    <GlassCard className="justify-between gap-3 p-4" style={{ width: CLIP_WIDTH }}>
      <Text className={`text-[16px] font-medium leading-[24px] ${isRtl(item.language) ? 'text-right' : ''}`} numberOfLines={5}>
        &ldquo;{item.text?.trim()}&rdquo;
      </Text>
      <View className="gap-2.5">
        <Text variant="caption" numberOfLines={1}>
          — {clipCredit(item)}
        </Text>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => void player.toggle(item.id)}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Stop' : `Play, ${item.durationSec} seconds`}
            className="size-10 items-center justify-center rounded-full bg-accent active:opacity-85"
          >
            {loading ? (
              <Spinner size="sm" color={t.accentForeground} />
            ) : playing ? (
              <Pause size={18} color={t.accentForeground} fill={t.accentForeground} />
            ) : (
              <Play size={18} color={t.accentForeground} fill={t.accentForeground} style={{ marginLeft: 2 }} />
            )}
          </Pressable>
          <Text variant="caption" className="flex-1" numberOfLines={1}>
            {item.credit ? `Posted by ${item.penName}` : `${item.durationSec}s`}
          </Text>
          <HeartButton hearts={item.hearts} hearted={item.hearted} onPress={item.mine ? undefined : onHeart} />
          <Pressable onPress={onMore} hitSlop={8} accessibilityRole="button" accessibilityLabel="More" className="rounded-full p-1 active:opacity-60">
            <MoreHorizontal size={18} color={t.muted} />
          </Pressable>
        </View>
      </View>
    </GlassCard>
  );
}
