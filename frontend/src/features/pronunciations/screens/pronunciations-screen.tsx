import { router } from 'expo-router';
import { Spinner } from 'heroui-native';
import { ArrowRight, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ui/action-sheet';
import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { useTokens } from '@/lib/use-tokens';

import type { Pronunciation } from '../api/pronunciations.api';
import { PronunciationForm } from '../components/pronunciation-form';
import { usePronunciations } from '../hooks';

/** Every word the listener has taught the voices, kept until they change it */
export default function PronunciationsScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const list = usePronunciations();
  // null: closed; 'new': adding; otherwise the one being edited
  const [editing, setEditing] = useState<Pronunciation | 'new' | null>(null);
  const items = list.data ?? [];

  return (
    <CloudBackground>
      <KeyboardAwareScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 20 }}>
        <ScreenHeader title="Pronunciations" onBack={router.back} />
        <Text className="px-1 text-[15px] leading-[23px] text-muted">
          Teach the voices names, brands and words they say wrong. Every voice and every script uses them until you change them.
        </Text>

        <PrimaryButton label="Add a word" icon={<Plus size={18} color={t.accentForeground} />} onPress={() => setEditing('new')} />

        {list.isPending ? (
          <Spinner color={t.accent} className="my-6 self-center" />
        ) : items.length ? (
          <GlassCard className="p-1.5">
            {items.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setEditing(p)}
                accessibilityRole="button"
                accessibilityLabel={`${p.word}, said like ${p.sayAs}. Edit`}
                className="min-h-[52px] flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-default"
              >
                <Text className="shrink text-[16px] font-semibold" numberOfLines={1}>{p.word}</Text>
                <ArrowRight size={15} color={t.muted} />
                <Text className="flex-1 text-[16px] text-muted" numberOfLines={1}>{p.sayAs}</Text>
              </Pressable>
            ))}
          </GlassCard>
        ) : (
          <View className="items-center gap-1 px-6 py-8">
            <Text className="text-center text-[16px] font-semibold">No words yet</Text>
            <Text variant="caption" className="text-center">
              You can also add one from a script: tap a part, then “Fix how a word sounds”.
            </Text>
          </View>
        )}
      </KeyboardAwareScrollView>

      <ActionSheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a word' : 'Edit pronunciation'}>
        {editing !== null ? <PronunciationForm existing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} /> : null}
      </ActionSheet>
    </CloudBackground>
  );
}
