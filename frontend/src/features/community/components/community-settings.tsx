import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Ban, BookOpenText, PenLine, ScrollText, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SettingsRow, SettingsSection } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { getErrorMessage } from '@/lib/api/api-error';
import { useTokens } from '@/lib/use-tokens';

import { useBlocks, useCommunityProfile, useSetPenName, useUnblock } from '../hooks';

/** Profile's community settings: your posts, pen name, blocked writers, the rules (and review, for the team) */
export function CommunitySettings() {
  const t = useTokens();
  const profile = useCommunityProfile();
  const [sheet, setSheet] = useState<'pen' | 'blocks' | null>(null);

  return (
    <>
      <SettingsSection title="Explore community">
        <SettingsRow icon={<BookOpenText size={19} color={t.foreground} />} label="Your posts" onPress={() => router.push('/community/mine')} />
        <SettingsRow icon={<PenLine size={19} color={t.foreground} />} label="Pen name" value={profile.data?.penName ?? 'Not set'} onPress={() => setSheet('pen')} />
        <SettingsRow icon={<Ban size={19} color={t.foreground} />} label="Blocked writers" onPress={() => setSheet('blocks')} />
        <SettingsRow icon={<ScrollText size={19} color={t.foreground} />} label="Community rules" onPress={() => router.push('/legal/community')} />
        {profile.data?.isAdmin ? (
          <SettingsRow icon={<ShieldCheck size={19} color={t.foreground} />} label="Community review" detail="Reported posts and the contest theme" onPress={() => router.push('/community/review')} />
        ) : null}
      </SettingsSection>

      <ActionSheet visible={sheet === 'pen'} onClose={() => setSheet(null)} title="Pen name">
        {sheet === 'pen' ? <PenNameForm current={profile.data?.penName ?? ''} onDone={() => setSheet(null)} /> : null}
      </ActionSheet>
      <ActionSheet visible={sheet === 'blocks'} onClose={() => setSheet(null)} title="Blocked writers">
        {sheet === 'blocks' ? <BlockedList /> : null}
      </ActionSheet>
    </>
  );
}

function PenNameForm({ current, onDone }: { current: string; onDone: () => void }) {
  const t = useTokens();
  const { toast } = useToast();
  const save = useSetPenName();
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  return (
    <View className="gap-3">
      <Text variant="caption">Shown on everything you publish in Explore, including what’s already there.</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        autoFocus
        maxLength={40}
        autoCapitalize="words"
        placeholder="e.g. Moonlit Pages"
        placeholderTextColor={t.muted}
        accessibilityLabel="Pen name"
        className="rounded-2xl border border-field-border bg-field px-4 py-3 font-sans text-[16px] text-foreground"
      />
      <InlineAlert message={error} />
      <PrimaryButton
        label="Save"
        isLoading={save.isPending}
        isDisabled={name.trim().length < 2 || name.trim() === current}
        onPress={() =>
          save.mutate(name.trim(), {
            onSuccess: () => {
              toast.show({ label: 'Pen name saved' });
              onDone();
            },
            onError: (e) => setError(getErrorMessage(e)),
          })
        }
      />
    </View>
  );
}

function BlockedList() {
  const t = useTokens();
  const blocks = useBlocks(true);
  const unblock = useUnblock();
  if (blocks.isPending) return <Spinner color={t.accent} className="my-6 self-center" />;
  if (!blocks.data?.length) return <Text variant="caption" className="pb-4">Nobody. Block a writer from the ⋯ on anything they publish, and nothing of theirs shows in your Explore.</Text>;
  return (
    <View className="pb-2">
      {blocks.data.map((b) => (
        <View key={b.userId} className="flex-row items-center gap-3 py-2.5">
          <Text className="flex-1 text-[16px] font-medium" numberOfLines={1}>{b.penName}</Text>
          <Pressable onPress={() => unblock.mutate(b.userId)} disabled={unblock.isPending} accessibilityRole="button" className="rounded-full bg-surface-secondary px-4 py-2 active:opacity-70">
            <Text className="text-[14px] font-semibold text-accent">Unblock</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
