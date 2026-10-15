import { useToast } from 'heroui-native';
import { useState, type ReactNode } from 'react';
import { TextInput, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ChoiceChips } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import type { DocumentSummary } from '@/features/library/types';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import type { FormatId, NarrationTypeId, PlatformId, StudioCatalog, StudioSettings, ToneId } from '../api/studio.api';
import { useStudioCatalog, useUpdateStudio } from '../hooks/use-studio';
import { formatClock } from '../lib/time';

const SPEEDS = ['auto', 0.75, 0.85, 0.9, 1, 1.1, 1.2, 1.25] as const;
const PITCHES = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
type Speed = (typeof SPEEDS)[number];
type ToneChoice = ToneId | 'type' | 'own';
// A platform's own style is offered beside the kinds of narration, as "f:<id>"
export type NarrationChoice = NarrationTypeId | `f:${FormatId}` | 'none';

/** The narration styles of the platform's page in Studio, if it has one */
export const formatsFor = (c: StudioCatalog, platform: PlatformId | null) => {
  const page = platform ? c.pages.find((p) => p.platforms.includes(platform)) : null;
  return page ? page.formats.flatMap((f) => c.formats.find((x) => x.id === f) ?? []) : [];
};

/** "Shorts · Explainer", or what to tap when nothing's chosen */
export function studioLabel(document: Pick<DocumentSummary, 'studio'> | null | undefined, catalog?: StudioCatalog) {
  const s = document?.studio;
  const platform = s?.platform ? catalog?.platforms.find((p) => p.id === s.platform)?.label : null;
  const narration = s?.format ? catalog?.formats.find((f) => f.id === s.format)?.label : s?.type ? catalog?.types.find((t) => t.id === s.type)?.label : null;
  return [platform, narration].filter(Boolean).join(' · ') || 'Platform and sound';
}

/**
 * Where a script is going and how it sounds: the platform suggests a narration style (its own
 * first, from its page in Studio), which
 * sets the tone and pace unless the creator picks their own; pitch is theirs to set. Saving
 * voices again only the parts whose sound changes, when they're next played or exported.
 */
export function StudioSettingsSheet({ document, visible, onClose }: { document: DocumentSummary | null; visible: boolean; onClose: () => void }) {
  return (
    <ActionSheet visible={visible} onClose={onClose} title="Platform and sound">
      {document ? <Settings key={document.id} document={document} onDone={onClose} /> : null}
    </ActionSheet>
  );
}

function Settings({ document, onDone }: { document: DocumentSummary; onDone: () => void }) {
  const t = useTokens();
  const { toast } = useToast();
  const catalog = useStudioCatalog();
  const update = useUpdateStudio(document.id);
  const saved = document.studio;
  const [platform, setPlatform] = useState<PlatformId | null>(saved?.platform ?? null);
  const [type, setType] = useState<NarrationTypeId | null>(saved?.type ?? null);
  const [format, setFormat] = useState<FormatId | null>(saved?.format ?? null);
  const [tone, setTone] = useState<ToneChoice>(saved?.customTone ? 'own' : (saved?.tone ?? 'type'));
  const [ownTone, setOwnTone] = useState(saved?.customTone ?? '');
  const [speed, setSpeed] = useState<Speed>((saved?.speed as Speed | null) ?? 'auto');
  const [pitch, setPitch] = useState(saved?.pitch ?? 0);
  const c = catalog.data;
  if (!c) return <Text variant="caption" className="px-1 py-6 text-center">Loading…</Text>;

  const suggested = platform ? (c.platforms.find((p) => p.id === platform)?.types ?? []) : [];
  // The platform's suggestions first
  const types = [...c.types].sort((a, b) => Number(suggested.includes(b.id)) - Number(suggested.includes(a.id)));
  const styles = formatsFor(c, platform);
  const typeSpeed = (format ? c.formats.find((x) => x.id === format)?.speed : c.types.find((x) => x.id === type)?.speed) ?? 1;
  const narrated = !!(format || type);

  const save = () => {
    const settings: StudioSettings = {
      platform,
      type,
      format,
      tone: tone === 'type' || tone === 'own' ? null : tone,
      customTone: tone === 'own' && ownTone.trim() ? ownTone.trim() : null,
      speed: speed === 'auto' ? null : speed,
      pitch: pitch || null,
    };
    update.mutate(settings, {
      onSuccess: ({ partsChanged }) => {
        haptics.success();
        toast.show({ variant: 'success', label: partsChanged ? `Saved. ${partsChanged === 1 ? '1 part is' : `${partsChanged} parts are`} voiced again when you play or export.` : 'Saved' });
        onDone();
      },
      onError: haptics.error,
    });
  };

  return (
    <View className="gap-4">
      <Section title="Where it’s going" note={platformNote(c, platform)}>
        <ChoiceChips
          options={['none', ...c.platforms.map((p) => p.id)] as (PlatformId | 'none')[]}
          value={platform ?? 'none'}
          format={(v) => (v === 'none' ? 'Anywhere' : (c.platforms.find((p) => p.id === v)?.label ?? v))}
          onChange={(v) => {
            const next = v === 'none' ? null : v;
            setPlatform(next);
            // A style belongs to its platform's page; another platform's is let go
            const keeps = !!format && formatsFor(c, next).some((f) => f.id === format);
            if (format && !keeps) setFormat(null);
            // A first pick of platform brings its usual kind of narration
            if (next && !type && !keeps) setType(c.platforms.find((p) => p.id === next)?.types[0] ?? null);
          }}
        />
      </Section>

      <Section title="Narration style" note={styles.length ? `${c.pages.find((p) => p.platforms.includes(platform!))?.label}’s own styles come first.` : suggested.length ? 'The first ones suit this platform best.' : undefined}>
        <ChoiceChips
          options={[...styles.map((f) => `f:${f.id}` as const), 'none', ...types.map((x) => x.id)] as NarrationChoice[]}
          value={format ? (`f:${format}` as NarrationChoice) : (type ?? 'none')}
          format={(v) => (v === 'none' ? 'Plain' : v.startsWith('f:') ? (c.formats.find((x) => `f:${x.id}` === v)?.label ?? v) : (c.types.find((x) => x.id === v)?.label ?? v))}
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
      </Section>

      <Section title="Tone" note="Expressive voices take a tone. Natural and phone voices read the same either way.">
        <ChoiceChips
          options={['type', ...c.tones.map((x) => x.id), 'own'] as ToneChoice[]}
          value={tone}
          format={(v) => (v === 'type' ? (narrated ? 'From the narration' : 'Natural') : v === 'own' ? 'In my words' : (c.tones.find((x) => x.id === v)?.label ?? v))}
          onChange={setTone}
        />
        {tone === 'own' ? (
          <TextInput
            value={ownTone}
            onChangeText={setOwnTone}
            placeholder="Like a late-night radio host, slow and warm"
            placeholderTextColor={t.muted}
            maxLength={100}
            accessibilityLabel="The tone, in your words"
            className="mx-3 mb-2 rounded-2xl border border-field-border bg-field px-4 py-3 font-sans text-[15px] text-foreground"
          />
        ) : null}
      </Section>

      <Section title="Speed" note={speed === 'auto' ? `${narrated ? 'From the narration' : 'The voice’s own pace'}: ${typeSpeed}×` : 'Slower or faster than the voice’s own pace, in its own voice.'}>
        <ChoiceChips options={[...SPEEDS]} value={speed} format={(v) => (v === 'auto' ? 'Auto' : `${v}×`)} onChange={setSpeed} />
      </Section>

      <Section title="Pitch" note={pitch ? `${Math.abs(pitch)} semitone${Math.abs(pitch) === 1 ? '' : 's'} ${pitch > 0 ? 'higher' : 'lower'}, same voice.` : 'The voice’s own pitch.'}>
        <ChoiceChips options={PITCHES} value={pitch} format={(v) => (v > 0 ? `+${v}` : String(v))} onChange={setPitch} />
      </Section>

      <Text variant="caption" className="px-1">Speed and pitch apply to every voice ListenUp makes, not to phone voices. Parts you’ve locked keep their sound.</Text>
      <InlineAlert message={update.error ? getErrorMessage(update.error) : null} />
      <PrimaryButton label="Save" isLoading={update.isPending} onPress={save} />
    </View>
  );
}

/** What the platform asks for, in a line */
function platformNote(c: StudioCatalog, platform: PlatformId | null) {
  const p = platform ? c.platforms.find((x) => x.id === platform) : null;
  if (!p) return 'Pick one to get its length limit, the right volume and subtitles.';
  const length = p.maxSec ? `Up to ${formatClock(p.maxSec)}${p.id === 'tiktok' ? ' for most accounts' : ''}. ` : '';
  const loud = p.loudness === 'podcast' ? 'Podcast volume' : p.loudness === 'audiobook' ? 'Audiobook volume (Audible’s rules)' : 'Video volume';
  return `${length}${loud}${p.subtitles === 'wordsSrt' ? ', word-by-word subtitles' : p.subtitles === 'shortSrt' ? ', short subtitle lines' : p.subtitles === 'srt' ? ', subtitles' : ''}.`;
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View className="gap-0.5">
      <Text variant="label" className="px-1 text-muted">{title}</Text>
      {note ? <Text variant="caption" className="px-1">{note}</Text> : null}
      <View className="-mx-3">{children}</View>
    </View>
  );
}
