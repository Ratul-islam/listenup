import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { FileUp, LayoutTemplate } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ChoiceChips, ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { documentsApi, type ImportLanguage } from '@/features/library/api/documents.api';
import { useInvalidateDocuments } from '@/features/library/hooks/use-documents';
import type { DocumentSummary } from '@/features/library/types';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { LANGS, LANGUAGE_NAMES } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import type { FormatId, NarrationTypeId, PlatformId } from '../api/studio.api';
import { formatsFor, type NarrationChoice } from '../components/studio-settings-sheet';
import { useStudioCatalog } from '../hooks/use-studio';
import { formatClock } from '../lib/time';

// Must match the server's paste limit (MAX_PASTE_CHARS)
const MAX_CHARS = 200_000;
// English reading speed, for the length estimate while typing
const CHARS_PER_SECOND = 14.5;
const SCRIPT_FILES = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown', 'application/pdf', 'text/*'];

/**
 * A new script: paste the whole thing, however long. The server splits it into
 * parts, so nothing has to be cut up by hand, and each part can be fixed later
 * without voicing the rest again.
 */
export default function NewScriptScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<ImportLanguage>('auto');
  // Started from a style on a platform's page: that platform and style
  const params = useLocalSearchParams<{ platform?: PlatformId; format?: FormatId }>();
  const [platform, setPlatform] = useState<PlatformId | null>(params.platform ?? null);
  const [type, setType] = useState<NarrationTypeId | null>(null);
  const [format, setFormat] = useState<FormatId | null>(params.format ?? null);
  const catalog = useStudioCatalog();
  const invalidate = useInvalidateDocuments();
  const studio = platform || type || format ? { platform, type, format } : undefined;
  const styles = catalog.data ? formatsFor(catalog.data, platform) : [];
  const chosenPlatform = catalog.data?.platforms.find((p) => p.id === platform);
  const suggested = chosenPlatform?.types ?? [];
  const types = [...(catalog.data?.types ?? [])].sort((a, b) => Number(suggested.includes(b.id)) - Number(suggested.includes(a.id)));
  const template = format ? catalog.data?.formats.find((x) => x.id === format)?.templates : type ? catalog.data?.types.find((x) => x.id === type)?.templates : undefined;

  const opened = (doc: DocumentSummary) => {
    haptics.success();
    void invalidate();
    router.replace({ pathname: '/script/[id]', params: { id: doc.id } });
  };
  const create = useMutation({
    mutationFn: () => documentsApi.fromText({ title: title.trim() || undefined, text: text.trim(), language, script: true, studio }),
    onSuccess: opened,
    onError: haptics.error,
  });
  const upload = useMutation({
    mutationFn: async () => {
      const res = await DocumentPicker.getDocumentAsync({ type: SCRIPT_FILES, copyToCacheDirectory: true });
      const asset = res.assets?.[0];
      if (res.canceled || !asset) return null;
      return documentsApi.upload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType }, language, true, studio);
    },
    onSuccess: (doc) => doc && opened(doc),
    onError: haptics.error,
  });
  const error = create.error ?? upload.error;
  const length = text.trim().length;
  const seconds = length / CHARS_PER_SECOND;
  const maxSec = chosenPlatform?.maxSec ?? null;

  return (
    <CloudBackground>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32, paddingHorizontal: 20, gap: 18 }}
      >
        <ScreenHeader title="New script" onBack={router.back} />

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title (optional)"
          placeholderTextColor={t.muted}
          maxLength={200}
          accessibilityLabel="Title"
          className="rounded-2xl border border-field-border bg-field px-4 py-3.5 font-sans text-[16px] text-foreground"
        />
        <View className="gap-1">
          <Text variant="label" className="px-1 text-muted">Where it’s going</Text>
          <View className="-mx-3">
            <ChoiceChips
              options={['none', ...(catalog.data?.platforms.map((p) => p.id) ?? [])] as (PlatformId | 'none')[]}
              value={platform ?? 'none'}
              format={(v) => (v === 'none' ? 'Anywhere' : (catalog.data?.platforms.find((p) => p.id === v)?.label ?? v))}
              onChange={(v) => {
                const next = v === 'none' ? null : v;
                setPlatform(next);
                // A style belongs to its platform's page; another platform's is let go
                const keeps = !!format && !!catalog.data && formatsFor(catalog.data, next).some((f) => f.id === format);
                if (format && !keeps) setFormat(null);
                if (next && !type && !keeps) setType(catalog.data?.platforms.find((p) => p.id === next)?.types[0] ?? null);
              }}
            />
          </View>
          <Text variant="label" className="px-1 text-muted">Narration style</Text>
          <View className="-mx-3">
            <ChoiceChips
              options={[...styles.map((f) => `f:${f.id}` as const), 'none', ...types.map((x) => x.id)] as NarrationChoice[]}
              value={format ? (`f:${format}` as NarrationChoice) : (type ?? 'none')}
              format={(v) =>
                v === 'none' ? 'Plain' : v.startsWith('f:') ? (catalog.data?.formats.find((x) => `f:${x.id}` === v)?.label ?? v) : (catalog.data?.types.find((x) => x.id === v)?.label ?? v)
              }
              onChange={(v) => {
                if (v.startsWith('f:')) {
                  setFormat(v.slice(2) as FormatId);
                  setType(null);
                } else {
                  setFormat(null);
                  setType(v === 'none' ? null : (v as NarrationTypeId));
                }
              }}
            />
          </View>
          <Text variant="caption" className="px-1">It sets the voice’s tone and pace. You can change the tone, speed and pitch later, in the script.</Text>
        </View>

        <View className="gap-1.5">
          {template && !length ? (
            <Pressable
              onPress={() => setText(language === 'bn' ? template.bn : template.en)}
              accessibilityRole="button"
              className="flex-row items-center gap-2 self-start rounded-full bg-accent-soft-bg px-3.5 py-2 active:opacity-80"
            >
              <LayoutTemplate size={15} color={t.accent} />
              <Text className="text-[14px] font-semibold text-accent-soft-fg">Start from a template{language === 'bn' ? ' (বাংলা)' : ''}</Text>
            </Pressable>
          ) : null}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Paste your whole script here. Leave a blank line between paragraphs."
            placeholderTextColor={t.muted}
            multiline
            textAlignVertical="top"
            autoFocus
            maxLength={MAX_CHARS}
            accessibilityLabel="Script"
            className="min-h-[260px] rounded-2xl border border-field-border bg-field px-4 py-3.5 font-sans text-[16px] leading-6 text-foreground"
          />
          <Text variant="caption" className={`px-1 ${maxSec && seconds > maxSec ? 'text-danger' : ''}`}>
            {length
              ? `About ${formatClock(seconds)} of audio${maxSec ? (seconds > maxSec ? `, longer than ${chosenPlatform?.label}’s ${formatClock(maxSec)}` : ` of ${chosenPlatform?.label}’s ${formatClock(maxSec)}`) : ''}${length > MAX_CHARS * 0.8 ? ` · ${(MAX_CHARS - length).toLocaleString()} characters left` : ''}`
              : maxSec
                ? `${chosenPlatform?.label} takes up to ${formatClock(maxSec)}${platform === 'tiktok' ? ' for most accounts' : ''}.`
                : 'Any length, up to about 3 hours. No need to split it up.'}
          </Text>
        </View>

        <View className="gap-1">
          <Text variant="label" className="px-1 text-muted">Language</Text>
          <View className="-mx-3">
            <ChoiceChips options={['auto', ...LANGS] as ImportLanguage[]} value={language} format={(v) => (v === 'auto' ? 'Detect' : LANGUAGE_NAMES[v])} onChange={setLanguage} />
          </View>
        </View>

        <InlineAlert message={error ? getErrorMessage(error) : null} />
        <PrimaryButton label="Create script" isLoading={create.isPending} isDisabled={!length || upload.isPending} onPress={() => create.mutate()} />
        <Pressable
          onPress={() => upload.mutate()}
          disabled={create.isPending || upload.isPending}
          accessibilityRole="button"
          className="flex-row items-center justify-center gap-2 self-center rounded-full px-4 py-2 active:bg-default"
        >
          <FileUp size={16} color={t.accent} />
          <Text className="text-[14px] font-medium text-accent">{upload.isPending ? 'Uploading…' : 'Import a Word, text or PDF file instead'}</Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </CloudBackground>
  );
}
