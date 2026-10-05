import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useToast } from 'heroui-native';
import { Camera, ChevronDown, ClipboardPaste, FileUp, Globe, ImageIcon, NotebookPen } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { IconButton } from '@/components/ui/icon-button';
import { IconTile } from '@/components/ui/icon-tile';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ChoiceChips } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { LANGS, LANGUAGE_NAMES } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import type { ImportLanguage, PickedFile } from '../api/documents.api';
import { useImportFile, useImportText, useImportUrl } from '../hooks/use-documents';

const FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/epub+zip',
  'text/plain',
  'text/markdown',
  'text/*',
];

type Panel = 'text' | 'link' | null;

function Option({ icon, title, detail, onPress, disabled }: { icon: ReactNode; title: string; detail: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`flex-row items-center gap-3.5 rounded-2xl p-3 active:bg-default ${disabled ? 'opacity-50' : ''}`}
    >
      <IconTile size={44}>{icon}</IconTile>
      <View className="flex-1 gap-0.5">
        <Text className="text-[16px] font-semibold">{title}</Text>
        <Text variant="caption">{detail}</Text>
      </View>
    </Pressable>
  );
}

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { toast } = useToast();
  const [panel, setPanel] = useState<Panel>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState<ImportLanguage>('auto');
  const importFile = useImportFile();
  const importText = useImportText();
  const importUrl = useImportUrl();
  const busy = importFile.isPending || importText.isPending || importUrl.isPending;
  const error = importFile.error ?? importText.error ?? importUrl.error;

  const done = (name: string) => {
    haptics.success();
    toast.show({ variant: 'success', label: 'Added to your Soundshelf', description: `${name} will be ready to play in a moment.` });
    router.back();
  };

  const upload = (file: PickedFile) =>
    importFile.mutate({ file, language }, { onSuccess: (doc) => done(doc.title), onError: haptics.error });

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES, copyToCacheDirectory: true });
    const asset = res.assets?.[0];
    if (!res.canceled && asset) upload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
  };

  const pickImage = async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.show({ variant: 'danger', label: source === 'camera' ? 'Camera access is off' : 'Photo access is off', description: 'Allow it in Settings to import pages.' });
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.85 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = res.assets?.[0];
    if (res.canceled || !asset) return;
    const ext = asset.mimeType === 'image/png' ? 'png' : 'jpg';
    upload({ uri: asset.uri, name: asset.fileName ?? `page-${Date.now()}.${ext}`, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const pasteLink = async () => {
    const value = (await Clipboard.getStringAsync()).trim();
    if (value) setUrl(value);
  };

  return (
    <CloudBackground>
      <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
        <View className="h-14 flex-row items-center gap-3 px-5">
          <IconButton accessibilityLabel="Close" onPress={router.back} size={44}>
            <ChevronDown size={22} color={t.foreground} />
          </IconButton>
        </View>

        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 20 }}
        >
          <Text variant="h1" className="px-1 pt-2">What do you want to hear?</Text>

          <InlineAlert message={error ? getErrorMessage(error) : null} />

          <GlassCard className="gap-0.5 p-2">
            <Option icon={<FileUp size={20} color={t.accent} />} title="Upload a file" detail="PDF, Word, ePub or text" onPress={() => void pickFile()} disabled={busy} />
            <Option icon={<Camera size={20} color={t.accent} />} title="Photograph a page" detail="The text is read from the photo" onPress={() => void pickImage('camera')} disabled={busy} />
            <Option icon={<ImageIcon size={20} color={t.accent} />} title="Choose a photo" detail="Screenshots and saved pages" onPress={() => void pickImage('library')} disabled={busy} />
            <Option icon={<Globe size={20} color={t.accent} />} title="Web article" detail="Paste a link to an article" onPress={() => setPanel(panel === 'link' ? null : 'link')} disabled={busy} />
            <Option icon={<NotebookPen size={20} color={t.accent} />} title="Paste text" detail="Notes, emails, anything you copied" onPress={() => setPanel(panel === 'text' ? null : 'text')} disabled={busy} />
          </GlassCard>
          <View className="gap-1">
            <Text variant="label" className="px-1 text-muted">Language</Text>
            <View className="-mx-3">
              <ChoiceChips
                options={['auto', ...LANGS] as ImportLanguage[]}
                value={language}
                format={(v) => (v === 'auto' ? 'Detect' : LANGUAGE_NAMES[v])}
                onChange={setLanguage}
              />
            </View>
            <Text variant="caption" className="px-1">Documents can mix languages, and scanned pages work too.</Text>
          </View>

          {importFile.isPending ? (
            <PrimaryButton label="Uploading…" isLoading onPress={() => {}} />
          ) : null}

          {panel === 'link' ? (
            <GlassCard className="gap-4 p-5">
              <Text variant="title">Web article</Text>
              <View className="flex-row items-center gap-2 rounded-2xl border border-field-border bg-field pl-4 pr-1.5">
                <TextInput
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://"
                  placeholderTextColor={t.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  autoFocus
                  accessibilityLabel="Article link"
                  className="flex-1 py-3.5 font-sans text-[16px] text-foreground"
                />
                <Pressable onPress={() => void pasteLink()} accessibilityRole="button" accessibilityLabel="Paste link" className="flex-row items-center gap-1.5 rounded-xl px-3 py-2 active:bg-default">
                  <ClipboardPaste size={16} color={t.accent} />
                  <Text className="text-[14px] font-medium text-accent">Paste</Text>
                </Pressable>
              </View>
              <PrimaryButton
                label="Add article"
                isLoading={importUrl.isPending}
                isDisabled={!/^https?:\/\/\S+\.\S+/.test(url.trim())}
                onPress={() => importUrl.mutate({ url: url.trim(), language }, { onSuccess: (doc) => done(doc.title), onError: haptics.error })}
              />
            </GlassCard>
          ) : null}

          {panel === 'text' ? (
            <GlassCard className="gap-4 p-5">
              <Text variant="title">Paste text</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Title (optional)"
                placeholderTextColor={t.muted}
                maxLength={200}
                accessibilityLabel="Title"
                className="rounded-2xl border border-field-border bg-field px-4 py-3.5 font-sans text-[16px] text-foreground"
              />
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Paste or type anything to hear it read aloud…"
                placeholderTextColor={t.muted}
                multiline
                textAlignVertical="top"
                autoFocus
                accessibilityLabel="Text to read"
                className="min-h-[180px] rounded-2xl border border-field-border bg-field px-4 py-3.5 font-sans text-[16px] leading-6 text-foreground"
              />
              <PrimaryButton
                label="Add note"
                isLoading={importText.isPending}
                isDisabled={!text.trim()}
                onPress={() =>
                  importText.mutate(
                    { text: text.trim(), title: title.trim() || undefined, language },
                    { onSuccess: (doc) => done(doc.title), onError: haptics.error },
                  )
                }
              />
            </GlassCard>
          ) : null}
        </KeyboardAwareScrollView>
      </View>
    </CloudBackground>
  );
}
