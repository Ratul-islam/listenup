import { router, useLocalSearchParams } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { useEffect } from 'react';
import { View } from 'react-native';

import { CloudBackground } from '@/components/ui/cloud-background';
import { Text } from '@/components/ui/text';
import { readyTodaysDigest } from '@/features/library/components/digest-card';
import { useInvalidateDocuments } from '@/features/library/hooks/use-documents';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { getErrorMessage } from '@/lib/api/api-error';
import { useTokens } from '@/lib/use-tokens';

/**
 * Where the home-screen widget's taps land: `listenup://listen?doc=<id>` opens
 * that item in the player (`&play=1` starts it), and `?digest=1` makes or finds
 * today's digest and plays it. The shelf stays underneath, so Back works.
 */
export default function WidgetLinkScreen() {
  const t = useTokens();
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();
  const { doc, play, digest } = useLocalSearchParams<{ doc?: string; play?: string; digest?: string }>();

  useEffect(() => {
    void (async () => {
      try {
        const id = digest ? (await readyTodaysDigest()).id : doc;
        if (!id) throw new Error('Nothing to open.');
        if (digest) void invalidate();
        void audioEngine.open(id, { autoplay: !!digest || play === '1' });
        router.dismissTo('/');
        router.push('/player');
      } catch (e) {
        toast.show({ label: getErrorMessage(e) });
        router.dismissTo('/');
      }
    })();
    // Once per tap on the widget
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CloudBackground>
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <Spinner color={t.accent} />
        <Text variant="caption" className="text-center">{digest ? 'Writing today’s digest…' : 'Opening…'}</Text>
      </View>
    </CloudBackground>
  );
}
