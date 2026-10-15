import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Spinner, useToast } from 'heroui-native';
import { Leaf, Pause, Play, Smartphone, Sparkles } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { isOnDeviceActive, useOnDeviceStore } from '@/features/on-device/on-device-voice';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { LANGUAGE_NAMES, LANGUAGE_NAMES_EN, type Lang } from '@/lib/languages';
import { useTokens } from '@/lib/use-tokens';

import type { Voice, VoiceTier } from '../api/voices.api';
import { useVoices } from '../hooks/use-voices';
import { isMissingPhoneVoice, missingPhoneVoiceToast, previewUri } from '../lib/voice-preview';
import { VoiceAvatar } from './voice-avatar';

// Best first: what each level is, in one line
const TIERS: { tier: VoiceTier; title: string; detail: string; icon: (color: string) => ReactNode }[] = [
  { tier: 'expressive', title: 'Expressive', detail: 'Most lifelike, and they can laugh, whisper or cry', icon: (c) => <Sparkles size={15} color={c} /> },
  { tier: 'natural', title: 'Natural', detail: 'Clear and smooth, for long listening', icon: (c) => <Leaf size={15} color={c} /> },
  { tier: 'phone', title: 'Phone', detail: 'Free, and they work offline', icon: (c) => <Smartphone size={15} color={c} /> },
];

interface VoiceListProps {
  /** The document it's picked for: a voice translation also offers its speaker's voice */
  documentId?: string;
  languages: readonly Lang[];
  selectedIds: string[];
  onSelect: (voice: Voice) => void;
  /** The language tab to open on */
  initialLanguage?: Lang;
  /** Only these levels (a character is cast at the narrator's level); all when left out */
  tiers?: readonly VoiceTier[];
  /** Voices to leave out (the narrator, when choosing a character's voice) */
  excludeIds?: readonly string[];
  /** Leave out the listener's own voice (characters, and anything published, use ListenUp's voices) */
  builtInOnly?: boolean;
  /** Fill the screen (the Voices page); otherwise the voices scroll within `maxListHeight` (sheets) */
  fill?: boolean;
  maxListHeight?: number;
  /** Room below the last voice, e.g. for the phone's navigation bar */
  bottomInset?: number;
}

/**
 * Voices to choose from: a tab per language (when there's more than one) and
 * one level at a time, so a whole level fits without scrolling. The language
 * and level stay put while the voices scroll. It opens on the level of the
 * voice chosen now, and a dot marks that level. Tap a card to choose it, or
 * its play button to hear it.
 */
export function VoiceList({ languages, selectedIds, onSelect, initialLanguage, tiers, excludeIds, builtInOnly, fill, maxListHeight, bottomInset = 0, documentId }: VoiceListProps) {
  const t = useTokens();
  const { toast } = useToast();
  const { data } = useVoices(documentId);
  const preview = useAudioPlayer(null);
  const status = useAudioPlayerStatus(preview);
  const [lang, setLang] = useState<Lang>(initialLanguage && languages.includes(initialLanguage) ? initialLanguage : languages[0]);
  // A level picked by the listener; until then, the one their voice is in
  const [picked, setPicked] = useState<VoiceTier | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const onDevice = useOnDeviceStore((s) => isOnDeviceActive(s) && s.speakers);

  // No pause on unmount: useAudioPlayer frees the player first, which already stops
  // it, and pausing a freed player throws ("shared object that was already released")

  // What was playing stopped for the samples; leaving without choosing carries on with it
  useEffect(() => () => audioEngine.releasePreview(), []);

  const play = async (voice: Voice) => {
    haptics.tap();
    if (previewing === voice.id && status.playing) {
      preview.pause();
      return;
    }
    audioEngine.holdForPreview();
    setLoading(voice.id);
    try {
      preview.replace({ uri: await previewUri(voice) });
      preview.play();
      setPreviewing(voice.id);
    } catch (e) {
      toast.show(isMissingPhoneVoice(e) ? missingPhoneVoiceToast : { variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setLoading(null);
    }
  };

  const voices = (data?.voices ?? []).filter((v) => v.language === lang && (!tiers || tiers.includes(v.tier)) && !excludeIds?.includes(v.id) && !(builtInOnly && v.own));
  const levels = TIERS.filter(({ tier }) => voices.some((v) => v.tier === tier));
  const current = voices.find((v) => selectedIds.includes(v.id));
  const level = levels.find((l) => l.tier === picked) ?? levels.find((l) => l.tier === current?.tier) ?? levels[0];
  const group = level ? voices.filter((v) => v.tier === level.tier) : [];
  // Natural voices made on this phone cost nothing
  const detail = level?.tier === 'natural' && onDevice && group.every((v) => onDevice[v.id]) ? 'Free and unlimited on this phone' : level?.detail;

  return (
    <View className="gap-3" style={fill ? { flex: 1 } : undefined}>
      {languages.length > 1 ? (
        <LanguageTabs
          languages={languages}
          value={lang}
          onChange={(l) => {
            setLang(l);
            setPicked(null);
          }}
        />
      ) : null}
      {levels.length > 1 ? (
        <Segmented
          options={levels.map(({ tier, title }) => ({ id: tier, label: title, marked: current?.tier === tier }))}
          value={level!.tier}
          onChange={setPicked}
        />
      ) : null}
      {level ? (
        <View className="flex-row items-center gap-1.5 px-1">
          {level.icon(t.accent)}
          <Text variant="caption" className="flex-1" numberOfLines={1}>{detail}</Text>
        </View>
      ) : null}

      <ScrollView
        // A new language or level starts at its top
        key={`${lang}:${level?.tier}`}
        style={fill ? { flex: 1 } : { maxHeight: maxListHeight }}
        contentContainerStyle={{ gap: 8, paddingBottom: bottomInset }}
        showsVerticalScrollIndicator={false}
      >
        {group.map((voice) => (
          <VoiceRow
            key={voice.id}
            voice={voice}
            selected={selectedIds.includes(voice.id)}
            speaking={previewing === voice.id && status.playing}
            loading={loading === voice.id}
            onSelect={() => {
              haptics.tap();
              // A sample still playing would talk over the voice that's about to start
              if (status.playing) preview.pause();
              onSelect(voice);
            }}
            onPlay={() => void play(voice)}
          />
        ))}
        {!data ? <Spinner color={t.accent} className="my-6" /> : null}
      </ScrollView>
    </View>
  );
}

/** One chip per language, scrolling sideways; the chosen one is brought into view when it opens */
function LanguageTabs({ languages, value, onChange }: { languages: readonly Lang[]; value: Lang; onChange: (lang: Lang) => void }) {
  const scroller = useRef<ScrollView>(null);
  const shown = useRef(false);
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-5 grow-0"
      // As tall as its chips and no taller, whatever it sits in
      style={{ flexGrow: 0 }}
      contentContainerClassName="items-center gap-2 px-5"
      accessibilityRole="tablist"
    >
      {languages.map((l) => {
        const active = l === value;
        return (
          <Pressable
            key={l}
            onPress={() => (haptics.tap(), onChange(l))}
            onLayout={(e) => {
              if (!active || shown.current) return;
              shown.current = true;
              scroller.current?.scrollTo({ x: Math.max(e.nativeEvent.layout.x - 20, 0), animated: false });
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={LANGUAGE_NAMES_EN[l]}
            className={`rounded-full px-4 py-2 active:opacity-70 ${active ? 'bg-accent' : 'bg-surface-secondary'}`}
          >
            <Text className={`text-[14px] font-semibold ${active ? 'text-accent-foreground' : 'text-foreground'}`}>{LANGUAGE_NAMES[l]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function VoiceRow({
  voice,
  selected,
  speaking,
  loading,
  onSelect,
  onPlay,
}: {
  voice: Voice;
  selected: boolean;
  speaking: boolean;
  loading: boolean;
  onSelect: () => void;
  onPlay: () => void;
}) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${voice.name}, ${voice.accent}, ${voice.style}`}
      className={`flex-row items-center gap-3.5 rounded-[26px] border-[1.5px] p-2.5 pr-3 active:opacity-80 ${selected ? 'border-accent bg-accent-soft-bg' : 'border-transparent bg-surface'}`}
    >
      <VoiceAvatar name={voice.name} id={voice.id} size={56} phone={voice.tier === 'phone'} speaking={speaking} selected={selected} />
      <View className="flex-1 gap-0.5">
        <Text className="text-[16px] font-bold tracking-[-0.2px]" numberOfLines={1}>{voice.name}</Text>
        <Text variant="caption" numberOfLines={1}>
          {voice.tier === 'phone' || voice.own ? voice.style : `${voice.accent}, ${voice.style.toLowerCase()}`}
        </Text>
      </View>
      <Pressable
        onPress={onPlay}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={speaking ? `Stop ${voice.name}` : `Hear ${voice.name}`}
        className={`h-10 flex-row items-center gap-1.5 rounded-full pl-3 pr-3.5 active:opacity-70 ${speaking ? 'bg-accent' : selected ? 'bg-surface' : 'bg-accent-soft-bg'}`}
      >
        {loading ? (
          <Spinner size="sm" color={t.accent} />
        ) : speaking ? (
          <Pause size={14} color={t.accentForeground} fill={t.accentForeground} />
        ) : (
          <Play size={14} color={t.accent} fill={t.accent} />
        )}
        <Text className={`text-[13px] font-semibold ${speaking ? 'text-accent-foreground' : 'text-accent-soft-fg'}`}>{speaking ? 'Stop' : 'Hear'}</Text>
      </Pressable>
    </Pressable>
  );
}
