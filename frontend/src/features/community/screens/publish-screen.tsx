import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Spinner, Switch, useToast } from 'heroui-native';
import { Check, ImagePlus, Trophy } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { BookCover } from '@/features/explore/components/book-cover';
import { formatMinutes } from '@/features/player/hooks/use-player';
import { VoiceAvatar } from '@/features/voices/components/voice-avatar';
import { VoicePickerSheet } from '@/features/voices/components/voice-picker-sheet';
import { useVoice } from '@/features/voices/hooks/use-voices';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { isRtl } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import type { PublishBody } from '../api/community.api';
import { prizeList } from '../components/contest-card';
import { useCommunityProfile, usePublish, usePublishPreview } from '../hooks';
import { monthName } from '../lib/format';

const minutes = (sec: number) => Math.max(1, Math.round(sec / 60));

// A cover picture as it's sent: the server takes up to 6 MB, which is this many characters of base64
const COVER_MAX_BASE64 = 8_000_000;

/** A picture chosen as the cover: where it is on the phone (to show it), and its bytes (to send it) */
interface CoverPicture {
  uri: string;
  base64: string;
}

type Params = {
  id: string;
  /** Set for a clip: which words of which part */
  clip?: string;
  chunk?: string;
  start?: string;
  end?: string;
  text?: string;
  title?: string;
  voiceId?: string;
};

/**
 * "Publish to Explore": a whole writing (title, pen name, voice, the contest,
 * "I wrote this"), or a clip of a line or paragraph. Everything is checked
 * before it shows in Explore.
 */
export default function PublishScreen() {
  const params = useLocalSearchParams<Params>();
  const insets = useSafeAreaInsets();
  return (
    <CloudBackground>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 20 }}
      >
        <ScreenHeader title={params.clip ? 'Post a clip' : 'Publish to Explore'} onBack={router.back} />
        {params.clip ? <ClipForm params={params} /> : <WritingForm documentId={params.id} />}
      </KeyboardAwareScrollView>
    </CloudBackground>
  );
}

/** Your pen name: shown on everything you publish (asked for the first time, changeable after) */
function PenNameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTokens();
  return (
    <Field label="Pen name" hint="Shown on everything you publish. It can be your name, or not.">
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="e.g. Moonlit Pages"
        placeholderTextColor={t.muted}
        maxLength={40}
        autoCapitalize="words"
        accessibilityLabel="Pen name"
        className="rounded-2xl border border-field-border bg-field px-4 py-3 font-sans text-[16px] text-foreground"
      />
    </Field>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text variant="label">{label}</Text>
      {children}
      {hint ? <Text variant="caption">{hint}</Text> : null}
    </View>
  );
}

/**
 * The cover: the writer's own picture, cut to a book's shape as they choose it,
 * or the drawn cover every writing gets without one. It's shown as it will
 * look in Explore.
 */
function CoverField({ id, title, penName, cover, onChange }: { id: string; title: string; penName: string; cover: CoverPicture | null; onChange: (cover: CoverPicture | null) => void }) {
  const t = useTokens();
  const { toast } = useToast();
  const [choosing, setChoosing] = useState(false);

  const choose = async () => {
    setChoosing(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.show({ variant: 'danger', label: 'Photo access is off', description: 'Allow it in Settings to choose a cover.' });
        return;
      }
      // Cropped to a book's shape here, so the writer decides what shows
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [5, 7], quality: 0.7, base64: true });
      const asset = picked.assets?.[0];
      if (picked.canceled || !asset?.base64) return;
      if (asset.base64.length > COVER_MAX_BASE64) {
        toast.show({ variant: 'danger', label: 'That picture is too large', description: 'Choose one under 6 MB, or crop it smaller.' });
        return;
      }
      haptics.tap();
      onChange({ uri: asset.uri, base64: asset.base64 });
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setChoosing(false);
    }
  };

  return (
    <View className="flex-row items-center gap-4">
      {/* Drawn from the document, not the title, so its colour holds still while the title is typed */}
      <BookCover item={{ id, title: title || 'Your title', author: penName }} width={92} imageUrl={cover?.uri} />
      <View className="flex-1 gap-2">
        <View className="gap-0.5">
          <Text variant="label">Cover</Text>
          <Text variant="caption">{cover ? 'This is how it looks in Explore.' : 'Add a picture of your own, or keep this drawn cover.'}</Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <Pressable
            onPress={() => void choose()}
            disabled={choosing}
            accessibilityRole="button"
            accessibilityLabel={cover ? 'Change the cover picture' : 'Add a cover picture'}
            className={`h-10 flex-row items-center gap-1.5 rounded-full bg-accent-soft-bg pl-3 pr-4 active:opacity-70 ${choosing ? 'opacity-50' : ''}`}
          >
            <ImagePlus size={16} color={t.accent} />
            <Text className="text-[14px] font-semibold text-accent-soft-fg">{cover ? 'Change' : 'Add a picture'}</Text>
          </Pressable>
          {cover ? (
            <Pressable onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel="Remove the cover picture" className="h-10 justify-center rounded-full px-3 active:bg-default">
              <Text className="text-[14px] font-semibold text-muted">Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function RulesNote() {
  return (
    <Text variant="caption" className="text-center">
      {'We check everything before it shows in Explore. By publishing you agree to the '}
      <Text variant="caption" className="font-semibold text-accent" onPress={() => router.push('/legal/community')} accessibilityRole="link">
        community rules
      </Text>
      .
    </Text>
  );
}

function WritingForm({ documentId }: { documentId: string }) {
  const t = useTokens();
  const { toast } = useToast();
  const [voiceId, setVoiceId] = useState<string | undefined>();
  const preview = usePublishPreview(documentId, voiceId);
  const profile = useCommunityProfile();
  const publish = usePublish();
  const [title, setTitle] = useState<string | null>(null);
  const [penName, setPenName] = useState<string | null>(null);
  const [contest, setContest] = useState(false);
  const [ownWork, setOwnWork] = useState(false);
  const [cover, setCover] = useState<CoverPicture | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = preview.data;
  const voice = useVoice(voiceId ?? data?.voiceId);

  if (preview.isPending || profile.isPending) return <Spinner color={t.accent} className="my-10 self-center" />;
  if (preview.isError || !data) return <InlineAlert message={getErrorMessage(preview.error)} />;

  if (data.existing) {
    const { status, title: published } = data.existing;
    return (
      <GlassCard className="gap-3 p-5">
        <Text variant="title">{status === 'CHECKING' ? 'Being checked' : status === 'FAILED' ? 'Not ready yet' : 'Already published'}</Text>
        <Text variant="caption">
          {status === 'CHECKING'
            ? `“${published}” is being checked and will be in Explore in a few minutes.`
            : status === 'FAILED'
              ? `“${published}” couldn’t be made ready. Try it again, or remove it, from Your posts.`
              : `“${published}” is published from this. To publish a new version, unpublish that one first (its hearts go with it).`}
        </Text>
        <PrimaryButton label="See your posts" size="md" onPress={() => router.replace('/community/mine')} />
      </GlassCard>
    );
  }
  if (!data.canPublish) {
    return (
      <GlassCard className="gap-3 p-5">
        <Text variant="title">This can’t be published</Text>
        <Text variant="caption">{data.reason}</Text>
        <PrimaryButton label="Back" variant="secondary" size="md" onPress={router.back} />
      </GlassCard>
    );
  }

  const name = penName ?? profile.data?.penName ?? '';
  const heading = title ?? data.title;
  const toVoice = data.toVoice ?? { natural: 0, expressive: 0 };
  const costParts = [toVoice.expressive >= 30 && `${minutes(toVoice.expressive)} Expressive`, toVoice.natural >= 30 && `${minutes(toVoice.natural)} Natural`].filter(Boolean);
  const entered = data.contest.entry;
  const ready = heading.trim().length > 0 && name.trim().length >= 2 && ownWork;

  const submit = () => {
    setError(null);
    const body: PublishBody = {
      kind: 'writing',
      documentId,
      title: heading.trim(),
      voiceId: (voiceId ?? data.voiceId)!,
      contest: contest && !entered,
      ownWork: true,
      ...(name.trim() !== profile.data?.penName && { penName: name.trim() }),
      ...(cover && { cover: cover.base64 }),
    };
    publish.mutate(body, {
      onSuccess: () => {
        haptics.success();
        toast.show({ label: `Publishing “${body.title}”`, description: 'We’re checking it and finishing its audio. It’ll be in Explore in a few minutes.' });
        router.replace('/community/mine');
      },
      onError: (e) => {
        haptics.error();
        setError(getErrorMessage(e));
        if (hasErrorCode(e, 'USAGE_LIMIT_REACHED')) {
          toast.show({
            label: 'Not enough minutes left',
            actionLabel: 'See plans',
            onActionPress: ({ hide }) => {
              hide('all');
              router.push('/plans');
            },
          });
        }
      },
    });
  };

  return (
    <>
      <GlassCard className="gap-4 p-5">
        <CoverField id={documentId} title={heading.trim()} penName={name.trim()} cover={cover} onChange={setCover} />
        <Field label="Title">
          <TextInput
            value={heading}
            onChangeText={setTitle}
            maxLength={120}
            accessibilityLabel="Title"
            className={`rounded-2xl border border-field-border bg-field px-4 py-3 font-sans text-[16px] text-foreground ${isRtl(data.language) ? 'text-right' : ''}`}
          />
        </Field>
        <PenNameField value={name} onChange={setPenName} />
        <Field label="Voice" hint="Listeners hear it as you set it up: this voice, your emotions and pronunciations.">
          <Pressable onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel={`Voice: ${voice?.name ?? 'choose'}. Change`} className="flex-row items-center gap-3 rounded-2xl bg-surface-secondary px-3 py-2.5 active:opacity-80">
            <VoiceAvatar name={voice?.name ?? '?'} id={voice?.id} size={36} />
            <View className="flex-1">
              <Text className="text-[16px] font-semibold">{voice?.name ?? 'Choose a voice'}</Text>
              {voice ? <Text variant="caption">{voice.tier === 'expressive' ? 'Expressive' : 'Natural'} · {voice.style}</Text> : null}
            </View>
            <Text className="text-[14px] font-semibold text-accent">Change</Text>
          </Pressable>
        </Field>
        <Text variant="caption">
          {`${formatMinutes(data.durationSec ?? 0)} to listen to. `}
          {preview.isFetching
            ? 'Working out the cost…'
            : costParts.length
              ? `Finishing its audio uses about ${costParts.join(' and ')} minutes of yours, once. Listeners hear it free.`
              : 'Its audio is already made, so publishing uses none of your minutes.'}
        </Text>
      </GlassCard>

      <GlassCard className="gap-3 p-5">
        <View className="flex-row items-center gap-3">
          <Trophy size={20} color={t.accent} />
          <Text className="flex-1 text-[16px] font-semibold">Enter {monthName(data.contest.month)}’s contest</Text>
          <Switch isSelected={contest && !entered} isDisabled={!!entered} onSelectedChange={setContest} accessibilityLabel="Enter the contest" />
        </View>
        <Text variant="caption">
          {entered
            ? `You’ve entered “${entered.title}” this month. One entry a month.`
            : `${data.contest.theme ? `This month’s theme is “${data.contest.theme}”. ` : ''}One entry a month. The top ${data.contest.prizeMinutes.length} in each language win ${prizeList(data.contest.prizeMinutes)} Expressive minutes.`}
        </Text>
      </GlassCard>

      <Pressable
        onPress={() => {
          haptics.tap();
          setOwnWork(!ownWork);
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: ownWork }}
        className="flex-row items-center gap-3 rounded-2xl px-1 py-1 active:opacity-80"
      >
        <View className={`size-6 items-center justify-center rounded-md border-2 ${ownWork ? 'border-accent bg-accent' : 'border-border'}`}>
          {ownWork ? <Check size={15} color={t.accentForeground} strokeWidth={3} /> : null}
        </View>
        <Text className="flex-1 text-[15px] leading-[21px]">I wrote this myself, and it doesn’t share anyone’s private details.</Text>
      </Pressable>

      <InlineAlert message={error} />
      <PrimaryButton label="Publish" isLoading={publish.isPending} isDisabled={!ready || preview.isFetching} onPress={submit} />
      <RulesNote />

      <VoicePickerSheet
        visible={picking}
        onClose={() => setPicking(false)}
        languages={data.language ? [data.language] : undefined}
        selectedIds={voice ? [voice.id] : []}
        title="Publish in which voice?"
        builtInOnly
        onSelect={(v) => {
          if (v.tier === 'phone') {
            toast.show({ label: 'Pick a Natural or Expressive voice', description: 'Phone voices sound different on every phone.' });
            return;
          }
          setVoiceId(v.id);
          setPicking(false);
        }}
      />
    </>
  );
}

function ClipForm({ params }: { params: Params }) {
  const t = useTokens();
  const { toast } = useToast();
  const profile = useCommunityProfile();
  const publish = usePublish();
  const [penName, setPenName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (profile.isPending) return <Spinner color={t.accent} className="my-10 self-center" />;
  const name = penName ?? profile.data?.penName ?? '';

  const submit = () => {
    setError(null);
    publish.mutate(
      {
        kind: 'clip',
        documentId: params.id,
        chunkIndex: Number(params.chunk),
        start: Number(params.start),
        end: Number(params.end),
        voiceId: params.voiceId || undefined,
        ...(name.trim() !== profile.data?.penName && { penName: name.trim() }),
      },
      {
        onSuccess: () => {
          haptics.success();
          toast.show({ label: 'Posted', description: 'It’ll be in Explore’s Community once it’s checked.' });
          router.back();
        },
        onError: (e) => {
          haptics.error();
          setError(getErrorMessage(e));
        },
      },
    );
  };

  return (
    <>
      <GlassCard className="gap-2 p-5">
        <Text className="text-[18px] font-medium leading-[27px]">&ldquo;{params.text?.trim()}&rdquo;</Text>
        {params.title ? <Text variant="caption">— from {params.title}</Text> : null}
      </GlassCard>
      <Text variant="caption">It’s posted in the voice and with the emotions you hear in the player. Anyone in Explore can play it.</Text>
      <GlassCard className="p-5">
        <PenNameField value={name} onChange={setPenName} />
      </GlassCard>
      <InlineAlert message={error} />
      <PrimaryButton label="Post to Explore" isLoading={publish.isPending} isDisabled={name.trim().length < 2} onPress={submit} />
      <RulesNote />
    </>
  );
}
