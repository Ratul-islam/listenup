import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { getErrorMessage } from '@/lib/api/api-error';
import { useTokens } from '@/lib/use-tokens';

interface FolderNameSheetProps {
  visible: boolean;
  title: string;
  submitLabel: string;
  initial?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<unknown>;
}

/** Name a new folder, or rename one */
export function FolderNameSheet(props: FolderNameSheetProps) {
  return (
    <ActionSheet visible={props.visible} onClose={props.onClose} title={props.title}>
      {props.visible ? <NameForm {...props} /> : null}
    </ActionSheet>
  );
}

export function NameForm({ submitLabel, initial = '', onSubmit }: Pick<FolderNameSheetProps, 'submitLabel' | 'initial' | 'onSubmit'>) {
  const t = useTokens();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name.trim());
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Folder name"
        placeholderTextColor={t.muted}
        autoFocus
        maxLength={60}
        returnKeyType="done"
        onSubmitEditing={() => name.trim() && void submit()}
        accessibilityLabel="Folder name"
        className="rounded-2xl border border-field-border bg-field px-4 py-3.5 font-sans text-[16px] text-foreground"
      />
      <InlineAlert message={error} />
      <PrimaryButton label={submitLabel} isLoading={busy} isDisabled={!name.trim()} onPress={() => void submit()} />
    </View>
  );
}
