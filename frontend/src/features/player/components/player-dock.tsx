import { Spinner } from 'heroui-native';
import { ChevronRight, Mic, Smile, Sparkles, UsersRound } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { emotionMeta, tint } from '@/features/expression/catalog';
import { PlainVoiceNotice } from '@/features/expression/components/plain-voice-notice';
import { VoiceAvatar } from '@/features/voices/components/voice-avatar';
import { VoicePickerSheet } from '@/features/voices/components/voice-picker-sheet';
import { useVoice } from '@/features/voices/hooks/use-voices';
import { haptics } from '@/lib/haptics';
import { LANGS } from '@/lib/languages';
import { usePressScale } from '@/lib/use-press-scale';
import { useTokens } from '@/lib/use-tokens';

import { audioEngine } from '../engine/audio-engine';
import { useSpokenSpeaker } from '../hooks/use-sync-position';
import { useToolFeeling } from '../lib/tool-target';
import { usePlayerUi, type WordSelection } from '../store/player-ui.store';
import { usePlayerStore } from '../store/player.store';
import { PlayerControls } from './player-controls';
import { Scrubber } from './scrubber';
import { PaintTools, WordTools } from './text-tools';

interface PlayerDockProps {
  /** "Feeling" and "Say it" act on the tapped line, or the line being heard */
  onFeeling: () => void;
  onSayIt: () => void;
  onExpressive: () => void;
  /** "Make it expressive" is at work */
  directing: boolean;
  onCast: () => void;
  onDescribeWords: (words: WordSelection) => void;
  onMoreWords: (words: WordSelection) => void;
  /** Shown above the controls: an error, with what to do about it */
  alert?: ReactNode;
}

/**
 * Everything under the page: where you are, the playback controls, and one
 * row of tools that says what each does. While words are being chosen or
 * lines painted, that row is their tools instead.
 */
export function PlayerDock({ onFeeling, onSayIt, onExpressive, directing, onCast, onDescribeWords, onMoreWords, alert }: PlayerDockProps) {
  const insets = useSafeAreaInsets();
  const line = usePlayerUi((s) => s.line);
  const words = usePlayerUi((s) => s.words);
  const painting = usePlayerUi((s) => s.painting);

  return (
    <View
      className="gap-1 rounded-t-[32px] bg-surface px-5 pt-3 dark:border dark:border-border"
      style={{ paddingBottom: Math.max(insets.bottom, 8) + 6, boxShadow: '0px -1px 2px rgba(40, 30, 110, 0.03), 0px -10px 28px rgba(40, 30, 110, 0.07)' }}
    >
      {alert}
      <Scrubber />
      <PlayerControls />
      <View className="mt-1.5 gap-2 border-t border-border pt-2.5">
        {/* Feelings only play on Expressive voices: say so here, while one is being chosen */}
        {line || words || painting ? <PlainVoiceNotice chunkIndex={words?.chunkIndex ?? line?.chunkIndex} /> : null}
        {/* One set of tools at a time; each fades in as it takes the place */}
        <Animated.View key={words ? 'words' : painting ? 'paint' : 'tools'} entering={FadeIn.duration(180)}>
          {words ? (
            <WordTools onDescribe={onDescribeWords} onMore={onMoreWords} />
          ) : painting ? (
            <PaintTools />
          ) : (
            <ToolRow onFeeling={onFeeling} onSayIt={onSayIt} onExpressive={onExpressive} directing={directing} onCast={onCast} />
          )}
        </Animated.View>
      </View>
    </View>
  );
}

function Tool({ label, hint, onPress, children }: { label: string; hint: string; onPress: () => void; children: ReactNode }) {
  const press = usePressScale(0.9);
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={hint}
      className="flex-1 items-center gap-1 rounded-2xl py-1.5"
    >
      {/* The disc gives under the finger; its name stays put */}
      <Animated.View className="size-11 items-center justify-center" style={press.style}>
        {children}
      </Animated.View>
      <Text className="text-[12px] font-semibold leading-4" numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const DISC = 'size-11 items-center justify-center rounded-full';

/** The four things a listener reaches for most, each with its name under it */
function ToolRow({ onFeeling, onSayIt, onExpressive, directing, onCast }: Pick<PlayerDockProps, 'onFeeling' | 'onSayIt' | 'onExpressive' | 'directing' | 'onCast'>) {
  const t = useTokens();
  const feeling = useToolFeeling();
  const meta = feeling.emotion ? emotionMeta[feeling.emotion] : null;
  const picked = usePlayerUi((s) => !!s.line);
  const which = picked ? 'the line you tapped' : 'the line being read';

  return (
    <View className="flex-row">
      <VoiceTool onCast={onCast} />
      <Tool label="Feeling" hint={meta ? `${which} sounds ${meta.label.toLowerCase()}. Change how it sounds` : `Choose how ${which} sounds`} onPress={onFeeling}>
        <View className={`${DISC} bg-surface-secondary`} style={meta ? { backgroundColor: tint(meta.id) } : undefined}>
          {/* A new feeling arrives with a small pop, so a change on the line is noticed down here too */}
          <Animated.View key={meta?.id ?? 'none'} entering={ZoomIn.duration(220)}>
            {meta ? <Text className="text-[20px] leading-[26px]">{meta.emoji}</Text> : <Smile size={21} color={t.foreground} strokeWidth={1.8} />}
          </Animated.View>
        </View>
      </Tool>
      <Tool label="Say it" hint={`Say ${which} yourself, and the voice follows you`} onPress={onSayIt}>
        <View className={`${DISC} bg-accent-soft-bg`}>
          <Mic size={21} color={t.accent} strokeWidth={2} />
        </View>
      </Tool>
      <Tool label="Expressive" hint={directing ? 'AI is directing your story' : 'Make it expressive: AI finds the mood and gives each character a voice'} onPress={onExpressive}>
        <View className={`${DISC} bg-surface-secondary`}>{directing ? <Spinner size="sm" color={t.accent} /> : <Sparkles size={20} color={t.foreground} strokeWidth={1.8} />}</View>
      </Tool>
    </View>
  );
}

/**
 * Who is speaking right now, and the way to change the narrator. While a
 * character speaks in their own voice it's their face and name; while a new
 * voice is on its way it says so, so a pick never looks ignored.
 */
function VoiceTool({ onCast }: { onCast: () => void }) {
  const t = useTokens();
  const [open, setOpen] = useState(false);
  const chunkLanguage = usePlayerStore((s) => s.chunks[s.chunkIndex]?.language ?? 'en');
  const voices = usePlayerStore((s) => s.voices);
  const chunks = usePlayerStore((s) => s.chunks);
  const cast = usePlayerStore((s) => s.cast);
  const switchingTo = usePlayerStore((s) => s.switchingTo);
  // A part can have its own voice; otherwise its language's reads it
  const partVoiceId = usePlayerStore((s) => s.chunks[s.chunkIndex]?.ownVoiceId ?? s.voices[chunkLanguage]);
  const speaker = useSpokenSpeaker();
  const character = speaker ? cast.find((c) => c.name === speaker && c.ownVoice) : undefined;
  const reading = useVoice(character?.voiceId ?? partVoiceId);
  const incoming = useVoice(switchingTo);
  const voice = incoming ?? reading;
  // Voices for the languages this document actually contains
  const languages = useMemo(() => LANGS.filter((lang) => chunks.some((c) => c.language === lang)), [chunks]);
  const label = switchingTo ? 'Switching…' : character ? character.name : (voice?.name ?? 'Voice');

  return (
    <>
      <Tool
        label={label}
        hint={switchingTo ? `Switching to ${voice?.name ?? 'the new voice'}` : `${character ? `${character.name}, read by ${voice?.name ?? 'their own voice'}` : `Read by ${voice?.name ?? 'loading'}`}. Change the voice`}
        onPress={() => setOpen(true)}
      >
        {/* A new face (a character starts speaking, a new voice arrives) fades in rather than swapping in a blink */}
        <Animated.View key={voice?.id ?? 'none'} entering={FadeIn.duration(220)}>
          <VoiceAvatar name={voice?.name ?? '…'} id={voice?.id} size={44} phone={voice?.tier === 'phone'} />
        </Animated.View>
        {switchingTo ? (
          <View className="absolute inset-0 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(27, 28, 46, 0.45)' }}>
            <Spinner size="sm" color="#ffffff" />
          </View>
        ) : null}
      </Tool>

      <VoicePickerSheet
        visible={open}
        onClose={() => setOpen(false)}
        languages={languages}
        // Opens on the language being read, so a pick changes what's being heard
        initialLanguage={chunkLanguage}
        selectedIds={Object.values(voices)}
        onSelect={(v) => {
          setOpen(false);
          void audioEngine.setVoice(v.id);
        }}
        footer={
          cast.length ? (
            <Pressable
              onPress={() => {
                setOpen(false);
                onCast();
              }}
              accessibilityRole="button"
              className="min-h-12 flex-row items-center gap-3 rounded-2xl px-2 active:bg-default"
            >
              <UsersRound size={18} color={t.accent} />
              <Text className="flex-1 text-[15px] font-semibold">Character voices</Text>
              <Text variant="caption" className="max-w-[45%]" numberOfLines={1}>{cast.map((c) => c.name).join(', ')}</Text>
              <ChevronRight size={17} color={t.muted} />
            </Pressable>
          ) : null
        }
      />
    </>
  );
}
