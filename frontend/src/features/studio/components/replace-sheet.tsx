import { Switch, useToast } from 'heroui-native';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Text } from '@/components/ui/text';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { partsApi, type ReplaceResult } from '../api/parts.api';
import { usePartMutations } from '../hooks/use-scripts';
import { formatClock } from '../lib/time';

const fieldClass = 'rounded-2xl border border-field-border bg-field px-4 py-3.5 font-sans text-[16px] text-foreground';
// Wait for typing to pause before asking what would change
const PREVIEW_DELAY_MS = 350;

/**
 * Find and replace across a script (a character's name, a product, a typo).
 * Before anything changes it says how many parts would be voiced again and
 * roughly what that costs; locked parts are left alone.
 */
export function ReplaceSheet({ documentId, visible, onClose }: { documentId: string; visible: boolean; onClose: () => void }) {
  const t = useTokens();
  const { toast } = useToast();
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [wholeWord, setWholeWord] = useState(true);
  const [preview, setPreview] = useState<ReplaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { replace: apply } = usePartMutations(documentId);

  useEffect(() => {
    if (!visible || !find.trim()) return;
    let current = true;
    const timer = setTimeout(() => {
      partsApi
        .replace(documentId, { find, replace, wholeWord })
        .then((r) => current && setPreview(r))
        .catch((e) => current && setError(getErrorMessage(e)));
    }, PREVIEW_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [documentId, find, replace, wholeWord, visible]);

  const close = () => {
    setFind('');
    setReplace('');
    setPreview(null);
    setError(null);
    onClose();
  };

  const shown = find.trim() ? preview : null;
  const summary = !shown
    ? null
    : shown.matches === 0
      ? 'No matches.'
      : `${shown.matches === 1 ? '1 match' : `${shown.matches} matches`} in ${shown.parts.length === 1 ? '1 part' : `${shown.parts.length} parts`}. Those parts are voiced again, about ${formatClock(shown.secondsToVoice)} of your minutes; everything else is reused.`;

  return (
    <ActionSheet visible={visible} onClose={close} title="Find and replace">
      <View className="gap-3">
        <TextInput value={find} onChangeText={(v) => { setFind(v); setError(null); }} placeholder="Find" placeholderTextColor={t.muted} autoCorrect={false} autoFocus accessibilityLabel="Find" className={fieldClass} />
        <TextInput value={replace} onChangeText={setReplace} placeholder="Replace with" placeholderTextColor={t.muted} autoCorrect={false} accessibilityLabel="Replace with" className={fieldClass} />
        <View className="flex-row items-center justify-between px-1">
          <Text className="text-[15px]">Whole words only</Text>
          <Switch isSelected={wholeWord} onSelectedChange={setWholeWord} accessibilityLabel="Whole words only" />
        </View>
        {summary ? <Text variant="caption">{summary}</Text> : null}
        {shown?.lockedParts.length ? (
          <Text variant="caption">{shown.lockedParts.length === 1 ? '1 locked part' : `${shown.lockedParts.length} locked parts`} with a match will stay as they are.</Text>
        ) : null}
        <InlineAlert message={error} />
        <PrimaryButton
          label={shown?.parts.length ? `Replace in ${shown.parts.length === 1 ? '1 part' : `${shown.parts.length} parts`}` : 'Replace'}
          isLoading={apply.isPending}
          isDisabled={!shown?.parts.length}
          onPress={() =>
            apply.mutate(
              { find, replace, wholeWord, apply: true },
              {
                onSuccess: (r) => {
                  haptics.success();
                  toast.show({ variant: 'success', label: `Replaced in ${r.parts.length === 1 ? '1 part' : `${r.parts.length} parts`}` });
                  close();
                },
                onError: (e) => setError(getErrorMessage(e)),
              },
            )
          }
        />
      </View>
    </ActionSheet>
  );
}
