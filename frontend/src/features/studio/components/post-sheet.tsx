import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useToast } from 'heroui-native';
import { Copy } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ChoiceChips } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { documentsKey } from '@/features/library/hooks/use-documents';
import type { DocumentSummary } from '@/features/library/types';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { studioApi, type PlatformId, type PostCopy, type StudioCatalog } from '../api/studio.api';
import { ScriptChoice } from './script-choice';

/**
 * The caption, hashtags and title to post with a video: pick a script and a platform, and AI
 * writes them from the script in its own language. They're kept with the script, ready to copy.
 */
export function PostSheet({
  visible,
  onClose,
  scripts,
  platforms,
  catalog,
}: {
  visible: boolean;
  onClose: () => void;
  scripts: DocumentSummary[];
  /** The page's platforms, its main one first */
  platforms: PlatformId[];
  catalog: StudioCatalog;
}) {
  const [script, setScript] = useState<DocumentSummary | null>(null);
  const close = () => {
    setScript(null);
    onClose();
  };
  return (
    <ActionSheet visible={visible} onClose={close} title={script ? script.title : 'Caption, hashtags and title'}>
      {script ? (
        <Writer key={script.id} script={script} platforms={platforms} catalog={catalog} onBack={() => setScript(null)} />
      ) : (
        <View className="gap-3">
          <Text className="text-[15px] leading-[22px] text-muted">Pick a script. The post is written from its words, in its language.</Text>
          <ScriptChoice scripts={scripts} onPick={setScript} empty="Make a script first. Its post is written from it." />
        </View>
      )}
    </ActionSheet>
  );
}

function Writer({ script, platforms, catalog, onBack }: { script: DocumentSummary; platforms: PlatformId[]; catalog: StudioCatalog; onBack: () => void }) {
  const { toast } = useToast();
  const client = useQueryClient();
  const own = script.studio?.platform;
  const [platform, setPlatform] = useState<PlatformId>(own && platforms.includes(own) ? own : platforms[0]);
  const [written, setWritten] = useState<Partial<Record<PlatformId, PostCopy>>>(script.studio?.posts ?? {});
  const post = written[platform];
  const write = useMutation({
    mutationFn: () => studioApi.writePost(script.id, platform),
    onSuccess: ({ post: next }) => {
      haptics.success();
      setWritten((w) => ({ ...w, [platform]: next }));
      void client.invalidateQueries({ queryKey: documentsKey });
      void client.invalidateQueries({ queryKey: ['document', script.id] });
    },
    onError: haptics.error,
  });
  const copy = async (text: string, what: string) => {
    try {
      await Clipboard.setStringAsync(text);
      haptics.tap();
      toast.show({ variant: 'success', label: `${what} copied` });
    } catch {
      toast.show({ variant: 'danger', label: 'Couldn’t copy. Hold the text to select it instead.' });
    }
  };
  const label = (p: PlatformId) => catalog.platforms.find((x) => x.id === p)?.label ?? p;
  const everything = post ? [post.title, post.caption, post.hashtags.join(' '), post.tags.length ? post.tags.join(', ') : null].filter(Boolean).join('\n\n') : '';

  return (
    <View className="gap-4">
      {platforms.length > 1 ? (
        <View className="-mx-3">
          <ChoiceChips options={platforms} value={platform} format={label} onChange={setPlatform} />
        </View>
      ) : null}
      {post ? (
        <View className="gap-3">
          {post.coverText ? <Block title="On the first frame" text={post.coverText} onCopy={() => void copy(post.coverText!, 'Cover text')} /> : null}
          {post.title ? <Block title="Title" text={post.title} onCopy={() => void copy(post.title!, 'Title')} /> : null}
          <Block title={post.title ? 'Description' : 'Caption'} text={post.caption} onCopy={() => void copy(post.caption, post.title ? 'Description' : 'Caption')} />
          {post.hashtags.length ? <Block title="Hashtags" text={post.hashtags.join(' ')} onCopy={() => void copy(post.hashtags.join(' '), 'Hashtags')} /> : null}
          {post.tags.length ? <Block title="Tags" text={post.tags.join(', ')} onCopy={() => void copy(post.tags.join(', '), 'Tags')} /> : null}
          <PrimaryButton label="Copy all" onPress={() => void copy(everything, 'Everything')} />
        </View>
      ) : (
        <Text className="text-[15px] leading-[22px] text-muted">
          {platform === 'youtube' || platform === 'shorts' ? 'A title, a description, hashtags and search tags' : 'A caption that makes people watch to the end, hashtags, and a few words for the first frame'}
          , written for {label(platform)} from your script.
        </Text>
      )}
      <InlineAlert message={write.error ? getErrorMessage(write.error) : null} />
      <PrimaryButton label={post ? 'Write it again' : `Write it for ${label(platform)}`} variant={post ? 'secondary' : 'primary'} isLoading={write.isPending} onPress={() => write.mutate()} />
      <Pressable onPress={onBack} accessibilityRole="button" className="self-center rounded-full px-3 py-1.5 active:bg-default">
        <Text className="text-[14px] font-medium text-accent">Another script</Text>
      </Pressable>
    </View>
  );
}

function Block({ title, text, onCopy }: { title: string; text: string; onCopy: () => void }) {
  const t = useTokens();
  return (
    <View className="gap-1.5 rounded-2xl bg-surface-secondary p-3.5">
      <View className="flex-row items-center justify-between">
        <Text variant="label" className="text-muted">{title}</Text>
        <Pressable onPress={onCopy} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Copy ${title.toLowerCase()}`} className="flex-row items-center gap-1 rounded-full px-2 py-1 active:bg-default">
          <Copy size={14} color={t.accent} />
          <Text className="text-[13px] font-medium text-accent">Copy</Text>
        </Pressable>
      </View>
      <Text className="text-[15px] leading-[22px]" selectable>{text}</Text>
    </View>
  );
}
