import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Copy, Gift, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Share, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { useInvites, useRedeemInvite } from '../hooks';

/** "Invite a friend": your code to share, how many invites paid off, and a box for a friend's code */
export default function InviteScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { toast } = useToast();
  const params = useLocalSearchParams<{ code?: string }>();
  const { data } = useInvites();
  const redeem = useRedeemInvite();
  const [friendCode, setFriendCode] = useState(params.code ?? '');

  const share = async () => {
    if (!data) return;
    await Share.share({
      message:
        `I listen to my PDFs, articles and notes with ListenUp. Use my code ${data.code} and we both get ` +
        `${data.minutesEach} minutes of its most natural voices: ${data.link}`,
    });
  };

  const copy = async () => {
    if (!data) return;
    await Clipboard.setStringAsync(data.code);
    haptics.success();
    toast.show({ label: 'Code copied' });
  };

  const submit = () =>
    redeem.mutate(friendCode.trim(), {
      onSuccess: () => {
        haptics.success();
        toast.show({
          variant: 'success',
          label: 'Code added',
          description: `Listen for ${data?.listenMinutesNeeded ?? 5} minutes and you both get your minutes.`,
        });
      },
      onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }),
    });

  return (
    <CloudBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title="Invite friends" onBack={router.back} />

        {!data ? (
          <Spinner color={t.accent} />
        ) : (
          <>
            <GlassCard className="items-center gap-4 p-6">
              <View className="size-14 items-center justify-center rounded-full bg-accent-soft-bg">
                <Gift size={26} color={t.accent} />
              </View>
              <Text variant="h2" className="text-center">
                You both get {data.minutesEach} Expressive minutes
              </Text>
              <Text variant="lead" className="text-center">
                When a friend joins with your code, confirms their email and listens for {data.listenMinutesNeeded} minutes, you each get{' '}
                {data.minutesEach} minutes of the voices with emotions. They never expire.
              </Text>
              <View className="items-center gap-1 pt-1">
                <Text variant="caption">Your code</Text>
                <Text selectable className="font-mono text-[32px] tracking-[6px]">{data.code}</Text>
              </View>
              <View className="w-full gap-2.5">
                <PrimaryButton label="Share invite" icon={<Share2 size={18} color={t.accentForeground} />} onPress={() => void share()} />
                <PrimaryButton label="Copy code" variant="secondary" icon={<Copy size={18} color={t.foreground} />} onPress={() => void copy()} />
              </View>
            </GlassCard>

            <GlassCard className="gap-3 p-5">
              <View className="flex-row items-baseline justify-between">
                <Text variant="title">Your invites</Text>
                <Text variant="caption">
                  {data.rewarded} of {data.maxRewards} rewarded
                </Text>
              </View>
              <ProgressBar value={data.rewarded / data.maxRewards} />
              <Text variant="caption">
                {data.pending
                  ? `${data.pending === 1 ? '1 friend has' : `${data.pending} friends have`} joined and ${data.pending === 1 ? "hasn't" : "haven't"} listened for ${data.listenMinutesNeeded} minutes yet.`
                  : data.rewarded >= data.maxRewards
                    ? "You've earned minutes for every invite you can. Friends you invite still get theirs."
                    : 'Friends who join with your code show up here.'}
              </Text>
            </GlassCard>

            {data.invitedBy ? (
              <GlassCard className="gap-1 p-5">
                <Text variant="title">You joined with {data.invitedBy.name ? `${data.invitedBy.name}'s` : "a friend's"} code</Text>
                <Text variant="caption">
                  {data.invitedBy.rewarded
                    ? `You both got ${data.minutesEach} Expressive minutes.`
                    : `Listen for ${data.listenMinutesNeeded} minutes and you both get ${data.minutesEach} Expressive minutes.`}
                </Text>
              </GlassCard>
            ) : data.canRedeem ? (
              <GlassCard className="gap-3 p-5">
                <Text variant="title">Got a friend&apos;s code?</Text>
                <TextInput
                  value={friendCode}
                  onChangeText={(v) => setFriendCode(v.toUpperCase())}
                  placeholder="ABC123"
                  placeholderTextColor={t.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                  accessibilityLabel="Friend's invite code"
                  className="rounded-2xl border border-field-border bg-field px-4 py-3.5 font-mono text-[18px] tracking-[3px] text-foreground"
                />
                <PrimaryButton label="Add code" size="md" isLoading={redeem.isPending} isDisabled={friendCode.trim().length < 4} onPress={submit} />
              </GlassCard>
            ) : null}
          </>
        )}
      </ScrollView>
    </CloudBackground>
  );
}
