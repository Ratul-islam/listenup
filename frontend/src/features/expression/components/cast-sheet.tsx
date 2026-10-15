import { Spinner, useToast } from 'heroui-native';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { Text } from '@/components/ui/text';
import type { CastMember } from '@/features/library/types';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import type { Voice } from '@/features/voices/api/voices.api';
import { VoiceAvatar } from '@/features/voices/components/voice-avatar';
import { VoiceList } from '@/features/voices/components/voice-list';
import { useVoices } from '@/features/voices/hooks/use-voices';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { LANGS, LANGUAGE_NAMES_EN } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import { expressionsApi } from '../api/expressions.api';
import { refresh } from '../hooks/use-auto-expression';

/**
 * The story's characters and who reads each. AI cast them; any of them can be
 * given another voice here, or everything handed back to the narrator.
 */
export function CastSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [picking, setPicking] = useState<CastMember | null>(null);
  const close = () => {
    setPicking(null);
    onClose();
  };
  return (
    <ActionSheet visible={visible} onClose={close} title={picking ? `Who reads ${picking.name}?` : 'Character voices'}>
      {visible ? <Body picking={picking} setPicking={setPicking} /> : null}
    </ActionSheet>
  );
}

function Body({ picking, setPicking }: { picking: CastMember | null; setPicking: (member: CastMember | null) => void }) {
  const t = useTokens();
  const { toast } = useToast();
  const { data } = useVoices();
  const documentId = usePlayerStore((s) => s.documentId);
  const cast = usePlayerStore((s) => s.cast);
  // Natural voices made on this phone: parts where characters speak come from ListenUp instead
  const onPhone = usePlayerStore((s) => s.source === 'device');
  const [saving, setSaving] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const voiceOf = (id: string) => data?.voices.find((v) => v.id === id);

  const change = async (member: CastMember, voice: Voice | null) => {
    if (!documentId) return;
    setPicking(null);
    setSaving(member.name);
    // Their lines are in the part playing: the old voice stops now, not when the change is saved
    const held = audioEngine.holdForCast(member.name);
    try {
      await expressionsApi.setCastVoice(documentId, member.name, voice?.id ?? null);
      const replaying = await refresh(documentId, { replay: true });
      haptics.success();
      toast.show({
        label: voice ? `${voice.name} reads ${member.name} now` : `${member.name} is cast automatically again`,
        description: replaying || held ? 'Replaying this part so you hear it.' : undefined,
      });
    } catch (e) {
      haptics.error();
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      // Voices the part again if it changed; carries on as it was if the change failed
      if (held) audioEngine.play();
      setSaving(null);
    }
  };

  const removeAll = async () => {
    if (!documentId) return;
    setSaving('*');
    const held = audioEngine.holdForCast();
    try {
      await expressionsApi.removeCast(documentId);
      const replaying = await refresh(documentId, { replay: true });
      toast.show({ label: 'The narrator reads everything now', description: replaying || held ? 'Replaying this part so you hear it.' : 'Make it expressive brings the characters back.' });
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      if (held) audioEngine.play();
      setSaving(null);
      setConfirming(false);
    }
  };

  if (picking) {
    const narrator = voiceOf(picking.narratorId);
    if (!narrator) return null;
    // Expressive voices read any language, so a character can borrow one from another; Natural voices only read their own
    const languages = narrator.expressive ? [narrator.language, ...LANGS.filter((l) => l !== narrator.language)] : [narrator.language];
    return (
      <View className="gap-3">
        <Pressable onPress={() => setPicking(null)} accessibilityRole="button" className="min-h-11 flex-row items-center gap-0.5 self-start rounded-full pr-3 active:bg-default">
          <ChevronLeft size={19} color={t.foreground} />
          <Text className="text-[15px] font-semibold">All characters</Text>
        </Pressable>
        {narrator.expressive ? (
          <Text variant="caption">Voices listed under other languages can read {LANGUAGE_NAMES_EN[narrator.language]} too.</Text>
        ) : null}
        <VoiceList
          languages={languages}
          initialLanguage={narrator.language}
          tiers={[narrator.tier]}
          excludeIds={[narrator.id]}
          builtInOnly
          selectedIds={[picking.voiceId]}
          onSelect={(voice) => void change(picking, voice)}
          maxListHeight={400}
          bottomInset={8}
        />
      </View>
    );
  }

  const narrator = cast[0] ? voiceOf(cast[0].narratorId) : undefined;
  return (
    <View className="gap-3">
      <Text variant="lead">
        Each character reads their own lines{narrator ? `, and ${narrator.name} reads the rest` : ''}.
      </Text>
      {onPhone ? (
        <Text variant="caption" className="rounded-2xl bg-accent-soft-bg px-3.5 py-2.5 text-accent-soft-fg">
          Parts where characters speak are made by ListenUp, not on this phone, so they use Natural minutes.
        </Text>
      ) : null}

      <ScrollView style={{ maxHeight: 380 }} contentContainerClassName="gap-1" showsVerticalScrollIndicator={false}>
        {[...cast]
          .sort((a, b) => b.lines - a.lines)
          .map((member) => {
            const voice = voiceOf(member.voiceId);
            return (
              <Pressable
                key={member.name}
                onPress={() => member.narratorId && setPicking(member)}
                disabled={saving !== null}
                accessibilityRole="button"
                accessibilityLabel={`${member.name}, read by ${voice?.name ?? 'the narrator'}. Change their voice`}
                className="min-h-14 flex-row items-center gap-3 rounded-2xl px-1.5 py-2 active:bg-default"
              >
                <VoiceAvatar name={voice?.name ?? member.name} id={voice?.id} size={40} />
                <View className="flex-1">
                  <Text className="text-[16px] font-semibold" numberOfLines={1}>{member.name}</Text>
                  <Text variant="caption" numberOfLines={1}>
                    {!member.ownVoice ? 'Read by the narrator' : `Read by ${voice?.name ?? 'another voice'}${member.chosen ? ', your choice' : ''}`}
                  </Text>
                </View>
                {saving === member.name ? (
                  <Spinner size="sm" color={t.accent} />
                ) : (
                  <>
                    {member.chosen ? (
                      <Pressable onPress={() => void change(member, null)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Cast ${member.name} automatically again`} className="min-h-11 justify-center rounded-full px-2 active:bg-default">
                        <Text className="text-[14px] font-medium text-muted">Automatic</Text>
                      </Pressable>
                    ) : null}
                    <Text className="px-2 text-[14px] font-semibold text-accent">Change</Text>
                  </>
                )}
              </Pressable>
            );
          })}
      </ScrollView>

      <Pressable
        onPress={() => (confirming ? void removeAll() : setConfirming(true))}
        disabled={saving !== null}
        accessibilityRole="button"
        className="min-h-11 items-center justify-center rounded-full active:bg-default"
      >
        {saving === '*' ? (
          <Spinner size="sm" color={t.muted} />
        ) : (
          <Text className={`text-[14px] font-semibold ${confirming ? 'text-danger' : 'text-muted'}`}>
            {confirming ? 'Tap again to remove the character voices' : 'Let the narrator read everything'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
