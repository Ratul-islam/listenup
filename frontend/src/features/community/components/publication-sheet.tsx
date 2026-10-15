import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Ban, Flag, Pause, Play, Trash2, Trophy } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { ActionSheet, SheetAction } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { BookCover } from '@/features/explore/components/book-cover';
import { documentsApi } from '@/features/library/api/documents.api';
import { useInvalidateDocuments } from '@/features/library/hooks/use-documents';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { formatMinutes } from '@/features/player/hooks/use-player';
import { useVoice } from '@/features/voices/hooks/use-voices';
import { ApiError, getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { isRtl } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import { communityApi, type CommunityItem, type ReportReason } from '../api/community.api';
import { communityKey, useBlockWriter, useHeart, usePublication, useReport, useUnpublish } from '../hooks';
import { clipCredit, languageName, monthName } from '../lib/format';
import type { ClipPlayer } from '../lib/use-clip-player';
import { HeartButton } from './heart-button';

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'spam', label: 'Spam or advertising' },
  { id: 'hate', label: 'Hateful or bullying' },
  { id: 'sexual', label: 'Sexual content' },
  { id: 'violence', label: 'Threats or violence' },
  { id: 'copied', label: 'Someone else’s work' },
  { id: 'private', label: 'Someone’s private details' },
  { id: 'other', label: 'Something else' },
];

type Mode = 'main' | 'report' | 'block' | 'unpublish';

/** The writing's copy on the shelf, added now if it isn't there (or was deleted since) */
async function onShelf(item: CommunityItem) {
  if (item.documentId) {
    try {
      return await documentsApi.get(item.documentId);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
  }
  return communityApi.add(item.id);
}

/**
 * A writing or clip from the Community: what it is and who made it, Listen
 * (or ▶ for a clip), ♥ once you've heard it, and Report or Block. Your own
 * shows Unpublish instead.
 */
/** What to show: by id, with the list's copy (if any) to show at once */
export type PublicationTarget = { id: string; item?: CommunityItem };

export function PublicationSheet({ target, player, onClose }: { target: PublicationTarget | null; player: ClipPlayer; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('main');
  const [penName, setPenName] = useState<string | undefined>();
  const close = () => {
    setMode('main');
    onClose();
  };
  const name = penName ?? target?.item?.penName;
  const title = mode === 'report' ? 'What’s wrong with it?' : mode === 'block' ? `Block ${name}?` : mode === 'unpublish' ? 'Unpublish it?' : undefined;
  return (
    <ActionSheet visible={!!target} onClose={close} title={title}>
      {target ? <Details key={target.id} target={target} player={player} mode={mode} setMode={setMode} onPenName={setPenName} onClose={close} /> : null}
    </ActionSheet>
  );
}

interface DetailsProps {
  target: PublicationTarget;
  player: ClipPlayer;
  mode: Mode;
  setMode: (m: Mode) => void;
  onPenName: (name: string) => void;
  onClose: () => void;
}

function Details({ target, player, mode, setMode, onPenName, onClose }: DetailsProps) {
  const detail = usePublication(target.id);
  // The list's copy at once; the detail adds how long is left to listen before hearting
  const item = detail.data ?? target.item;
  if (detail.isError && !item) return <InlineAlert message={getErrorMessage(detail.error)} />;
  if (!item) return <Spinner className="my-8 self-center" />;
  const goTo = (m: Mode) => {
    onPenName(item.penName);
    setMode(m);
  };
  return <Loaded item={item} heartAfter={detail.data?.heartAfterSec ?? null} player={player} mode={mode} setMode={goTo} onClose={onClose} />;
}

interface LoadedProps {
  item: CommunityItem;
  /** Seconds still to listen before hearting */
  heartAfter: number | null;
  player: ClipPlayer;
  mode: Mode;
  setMode: (m: Mode) => void;
  onClose: () => void;
}

function Loaded({ item, heartAfter, player, mode, setMode, onClose }: LoadedProps) {
  const t = useTokens();
  const { toast } = useToast();
  const client = useQueryClient();
  const invalidateDocuments = useInvalidateDocuments();
  const voice = useVoice(item.voiceId);
  const heart = useHeart();
  const report = useReport();
  const block = useBlockWriter();
  const unpublish = useUnpublish();
  const [error, setError] = useState<string | null>(null);
  const isClip = item.kind === 'clip';
  const thisMonth = new Date().toISOString().slice(0, 7);

  const listen = useMutation({
    mutationFn: () => onShelf(item),
    onMutate: () => setError(null),
    onSuccess: (doc) => {
      onClose();
      void audioEngine.open(doc.id);
      router.push('/player');
    },
    onError: (e) => setError(getErrorMessage(e)),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: communityKey });
      void invalidateDocuments();
    },
  });

  const toggleHeart = () =>
    heart.mutate({ id: item.id, on: !item.hearted }, { onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }) });

  if (mode === 'report') {
    return (
      <View>
        {REASONS.map((r) => (
          <SheetAction
            key={r.id}
            icon={<Flag size={18} color={t.muted} />}
            label={r.label}
            disabled={report.isPending}
            onPress={() =>
              report.mutate(
                { id: item.id, reason: r.id },
                {
                  onSuccess: () => {
                    haptics.success();
                    toast.show({ label: 'Thanks for telling us', description: 'You won’t see it again, and we’ll take a look.' });
                    onClose();
                  },
                  onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }),
                },
              )
            }
          />
        ))}
      </View>
    );
  }

  if (mode === 'block') {
    return (
      <View className="gap-4">
        <Text className="text-[15px] leading-[23px] text-muted">
          Nothing {item.penName} publishes will show in your Explore. You can unblock them in Profile.
        </Text>
        <PrimaryButton
          label="Block"
          isLoading={block.isPending}
          onPress={() =>
            block.mutate(item.id, {
              onSuccess: () => {
                toast.show({ label: `${item.penName} is blocked` });
                onClose();
              },
              onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }),
            })
          }
        />
        <PrimaryButton label="Cancel" variant="secondary" onPress={() => setMode('main')} />
      </View>
    );
  }

  if (mode === 'unpublish') {
    return (
      <View className="gap-4">
        <Text className="text-[15px] leading-[23px] text-muted">
          {isClip
            ? 'It leaves Explore, with its hearts.'
            : `It leaves Explore and the shelves of everyone who added it, with its hearts${item.contestMonth === thisMonth ? ', and leaves this month’s contest' : ''}.`}
        </Text>
        <Pressable
          onPress={() =>
            unpublish.mutate(item.id, {
              onSuccess: () => {
                toast.show({ label: 'Unpublished' });
                onClose();
              },
              onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }),
            })
          }
          disabled={unpublish.isPending}
          accessibilityRole="button"
          className="h-14 items-center justify-center rounded-full bg-danger active:opacity-85"
        >
          <Text className="text-[16px] font-semibold text-danger-foreground">Unpublish</Text>
        </Pressable>
        <PrimaryButton label="Keep it" variant="secondary" onPress={() => setMode('main')} />
      </View>
    );
  }

  const playing = player.playingId === item.id;
  return (
    <View className="gap-4 pb-1">
      {isClip ? (
        <View className="gap-2 rounded-2xl bg-surface-secondary px-4 py-3.5">
          <Text className={`text-[17px] font-medium leading-[26px] ${isRtl(item.language) ? 'text-right' : ''}`}>&ldquo;{item.text?.trim()}&rdquo;</Text>
          <Text variant="caption">— {clipCredit(item)}</Text>
        </View>
      ) : (
        <View className="flex-row gap-4">
          <BookCover item={{ id: item.id, title: item.title, author: item.penName }} width={96} added={!!item.documentId} imageUrl={item.coverUrl} />
          <View className="flex-1 justify-center gap-1">
            <Text variant="title" numberOfLines={3}>{item.title}</Text>
            <Text className="text-[15px] font-medium" numberOfLines={1}>{item.penName}</Text>
            <Text variant="caption">{`${formatMinutes(item.durationSec)} · ${languageName(item.language)}${voice ? ` · ${voice.name}’s voice` : ''}`}</Text>
          </View>
        </View>
      )}

      {!isClip ? <Text className={`text-[15px] leading-[23px] text-muted ${isRtl(item.language) ? 'text-right' : ''}`} numberOfLines={5}>{item.excerpt}</Text> : null}

      {item.contestMonth === thisMonth ? (
        <View className="flex-row items-center gap-2 self-start rounded-full bg-accent-soft-bg px-3 py-1.5">
          <Trophy size={14} color={t.accentSoftFg} />
          <Text className="text-[13px] font-semibold text-accent-soft-fg">In {monthName(item.contestMonth)}’s contest</Text>
        </View>
      ) : null}

      <InlineAlert message={error} />
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          {isClip ? (
            <PrimaryButton
              label={playing ? 'Stop' : 'Play'}
              icon={playing ? <Pause size={18} color={t.accentForeground} fill={t.accentForeground} /> : <Play size={18} color={t.accentForeground} fill={t.accentForeground} />}
              isLoading={player.loadingId === item.id}
              onPress={() => void player.toggle(item.id).catch((e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }))}
            />
          ) : (
            <PrimaryButton label={listen.isPending ? 'Opening…' : 'Listen'} isLoading={listen.isPending} onPress={() => listen.mutate()} />
          )}
        </View>
        {item.mine ? (
          <HeartButton hearts={item.hearts} hearted={false} size="md" />
        ) : (
          <HeartButton hearts={item.hearts} hearted={item.hearted} size="md" onPress={heartAfter ? () => toast.show({ label: 'Listen a little first', description: 'Hearts are for writing you’ve heard: about half of it, or 2 minutes.' }) : toggleHeart} />
        )}
      </View>
      {!item.mine && heartAfter ? (
        <Text variant="caption" className="-mt-1 text-center">Listen for about {Math.max(1, Math.round(heartAfter / 60))} more min to heart it.</Text>
      ) : null}

      <View className="flex-row justify-center gap-2">
        {item.mine ? (
          <SmallAction icon={<Trash2 size={15} color={t.danger} />} label="Unpublish" danger onPress={() => setMode('unpublish')} />
        ) : (
          <>
            <SmallAction icon={<Flag size={15} color={t.muted} />} label="Report" onPress={() => setMode('report')} />
            <SmallAction icon={<Ban size={15} color={t.muted} />} label="Block writer" onPress={() => setMode('block')} />
          </>
        )}
      </View>
    </View>
  );
}

function SmallAction({ icon, label, onPress, danger }: { icon: ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-1.5 rounded-full px-3 py-2 active:bg-default">
      {icon}
      <Text className={`text-[14px] font-medium ${danger ? 'text-danger' : 'text-muted'}`}>{label}</Text>
    </Pressable>
  );
}
