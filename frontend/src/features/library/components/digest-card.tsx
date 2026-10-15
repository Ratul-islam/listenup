import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Sparkles } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { localDay } from '@/features/player/api/playback.api';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { getErrorMessage } from '@/lib/api/api-error';
import { useTokens } from '@/lib/use-tokens';

import { documentsApi } from '../api/documents.api';
import { useInvalidateDocuments } from '../hooks/use-documents';

const POLL_MS = 2000;
const WAIT_MS = 90_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Makes (or finds) today's digest and waits until it can play (also from the home-screen widget) */
export async function readyTodaysDigest() {
  let doc = await documentsApi.digest(localDay());
  const deadline = Date.now() + WAIT_MS;
  while (doc.status !== 'READY' && doc.status !== 'FAILED' && Date.now() < deadline) {
    await sleep(POLL_MS);
    doc = await documentsApi.get(doc.id);
  }
  if (doc.status !== 'READY') throw new Error(doc.error ?? "Today's digest is taking a while. It'll be on your shelf shortly.");
  return doc;
}

/** "Today's digest": a short spoken briefing on what you've been reading. It opens in the player, in place of the page it's on. */
export function DigestCard() {
  const t = useTokens();
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();
  const digest = useMutation({
    mutationFn: readyTodaysDigest,
    onSuccess: (doc) => {
      void audioEngine.open(doc.id);
      router.replace('/player');
    },
    onSettled: () => void invalidate(),
    onError: (e) => toast.show({ label: getErrorMessage(e) }),
  });

  return (
    <Pressable
      onPress={() => digest.mutate()}
      disabled={digest.isPending}
      accessibilityRole="button"
      accessibilityLabel="Play today's digest"
      className="flex-row items-center gap-3.5 rounded-2xl p-3 active:bg-default"
    >
      <IconTile size={44}>{digest.isPending ? <Spinner size="sm" color={t.accent} /> : <Sparkles size={20} color={t.accent} />}</IconTile>
      <View className="flex-1 gap-0.5">
        <Text className="text-[16px] font-semibold">Today&apos;s digest</Text>
        <Text variant="caption" numberOfLines={1}>{digest.isPending ? 'Writing your briefing…' : 'A short spoken briefing on your recent reads'}</Text>
      </View>
    </Pressable>
  );
}
