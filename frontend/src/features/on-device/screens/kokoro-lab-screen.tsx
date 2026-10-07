import { useAudioPlayer } from 'expo-audio';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ChoiceChips, ScreenHeader, SettingsSection } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { audioEngine } from '@/features/player/engine/audio-engine';
import { useTokens } from '@/lib/use-tokens';
import { kokoroVoice, type KokoroBenchmark, type KokoroProvider } from '@/modules/kokoro-voice';

import { FAST_ENOUGH, onDeviceVoice, useOnDeviceStore } from '../on-device-voice';

const THREADS = [0, 1, 2, 3, 4, 6, 8];
const PROVIDERS: KokoroProvider[] = ['cpu', 'xnnpack', 'nnapi'];

// A test line per Kokoro language, by the voice's first letter
const SAMPLES: Record<string, string> = {
  a: 'Dr. Smith read 42 pages of the novel on Tuesday, then walked to the library at 3:30 PM.',
  b: 'The schedule for the aluminium factory tour was rather tomato-heavy, I’m afraid.',
  h: 'नमस्ते, मैं आपके लेख, नोट्स और किताबें पढ़कर सुनाने के लिए तैयार हूँ।',
  e: 'Hola, estoy aquí para leerte en voz alta tus artículos, notas y libros, cuando quieras.',
  p: 'Olá, estou aqui para ler em voz alta seus artigos, notas e livros, quando você quiser.',
  f: 'Bonjour, je suis là pour vous lire à voix haute vos articles, notes et livres, quand vous voulez.',
  i: 'Ciao, sono qui per leggerti ad alta voce articoli, appunti e libri, quando vuoi.',
  z: '今天是2026年10月7日，我买了3本书，花了128.5元。',
};

/**
 * Test screen for Natural voices on the phone (long-press the intro on the
 * Natural voices page): speed by thread count and backend, and every voice.
 */
export default function KokoroLabScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { status, threads, provider } = useOnDeviceStore();
  const player = useAudioPlayer(null);
  const [pickThreads, setPickThreads] = useState(threads ?? 0);
  const [pickProvider, setPickProvider] = useState<KokoroProvider>(provider ?? 'cpu');
  const [results, setResults] = useState<KokoroBenchmark[]>([]);
  const [speaker, setSpeaker] = useState(status.speakers[0] ?? 'af_heart');
  const [text, setText] = useState(SAMPLES[speaker[0]] ?? SAMPLES.a);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const bench = () =>
    run(async () => {
      const result = await kokoroVoice.benchmark(pickThreads || null, pickProvider);
      setResults((r) => [result, ...r]);
    });

  const speak = () =>
    run(async () => {
      audioEngine.pause();
      const clip = await kokoroVoice.synthesize(text, speaker);
      setLast(
        clip.elapsedMs
          ? `${(clip.durationMs / 1000).toFixed(1)} s of speech in ${(clip.elapsedMs / 1000).toFixed(1)} s (RTF ${(clip.elapsedMs / clip.durationMs).toFixed(2)})`
          : `${(clip.durationMs / 1000).toFixed(1)} s, from the cache`,
      );
      player.replace({ uri: clip.uri });
      player.play();
    });

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 18 }}>
        <ScreenHeader title="Voice lab" onBack={router.back} />
        <GlassCard className="gap-1 p-4">
          <Text className="text-[15px]">
            {status.installed ? `Package ${status.version}, ${status.speakers.length} voices` : 'Not installed'} · {status.cores} cores · speaks with{' '}
            {status.threads} threads
          </Text>
          <Text variant="caption">On-device voicing turns on at an RTF × playback speed of {FAST_ENOUGH} or less.</Text>
        </GlassCard>

        <InlineAlert message={error} />

        <SettingsSection title="Speed">
          <Text className="px-3 pt-3 text-[16px] font-medium">Threads</Text>
          <ChoiceChips options={THREADS} value={pickThreads} format={(v) => (v ? String(v) : 'Auto')} onChange={setPickThreads} />
          <Text className="px-3 pt-1 text-[16px] font-medium">Backend</Text>
          <ChoiceChips options={PROVIDERS} value={pickProvider} format={(v) => v} onChange={setPickProvider} />
          <View className="gap-2 p-3">
            <PrimaryButton label="Run speed test" size="md" isLoading={busy} isDisabled={!status.installed} onPress={() => void bench()} />
            <PrimaryButton
              label="Speak with these settings"
              size="md"
              variant="secondary"
              onPress={() => onDeviceVoice.setOptions(pickThreads || null, pickProvider)}
            />
          </View>
          {results.map((r, i) => (
            <Text key={i} className="px-3 pb-2 font-mono text-[13px]" style={{ color: r.rtf <= FAST_ENOUGH ? t.success : t.danger }}>
              RTF {r.rtf.toFixed(2)} · {r.threads} threads · {r.provider} · load {(r.loadMs / 1000).toFixed(1)} s
            </Text>
          ))}
        </SettingsSection>

        <SettingsSection title="Voices">
          <ChoiceChips
            options={status.speakers}
            value={speaker}
            format={(v) => v}
            onChange={(v) => {
              setSpeaker(v);
              setText(SAMPLES[v[0]] ?? SAMPLES.a);
            }}
          />
          <View className="gap-2 p-3">
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              className="min-h-[96px] rounded-2xl bg-surface-secondary px-3 py-2.5 text-[16px] text-foreground"
              placeholderTextColor={t.muted}
              textAlignVertical="top"
            />
            <PrimaryButton label="Speak" size="md" isLoading={busy} isDisabled={!status.installed || !text.trim()} onPress={() => void speak()} />
            {last ? <Text variant="caption">{last}</Text> : null}
            <PrimaryButton label="Free the model’s memory" size="md" variant="secondary" onPress={() => void kokoroVoice.release()} />
          </View>
        </SettingsSection>
      </ScrollView>
    </CloudBackground>
  );
}
