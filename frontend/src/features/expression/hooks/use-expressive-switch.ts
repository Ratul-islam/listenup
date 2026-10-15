import { useToast } from 'heroui-native';

import { audioEngine } from '@/features/player/engine/audio-engine';
import { usePlayerStore } from '@/features/player/store/player.store';
import type { Voice } from '@/features/voices/api/voices.api';
import { useVoices } from '@/features/voices/hooks/use-voices';

/** The Expressive voice closest to a plain one: same language, then same accent and gender */
function closestExpressive(voices: Voice[], current: Voice | undefined, preferred: string | undefined) {
  const options = voices.filter((v) => v.expressive && v.language === current?.language);
  const score = (v: Voice) => (v.id === preferred ? 4 : 0) + (v.accent === current?.accent ? 2 : 0) + (v.gender === current?.gender ? 1 : 0);
  return options.sort((a, b) => score(b) - score(a))[0];
}

/**
 * Whether the voice reading a part can act out emotions, and if it can't, the
 * Expressive voice to offer in its place with one tap.
 */
export function useExpressiveSwitch(chunkIndex?: number) {
  const { toast } = useToast();
  const { data } = useVoices();
  const index = usePlayerStore((s) => chunkIndex ?? s.chunkIndex);
  const voiceId = usePlayerStore((s) => {
    const chunk = s.chunks[index];
    return chunk ? (chunk.ownVoiceId ?? s.voices[chunk.language]) : null;
  });
  const plain = usePlayerStore((s) => {
    const chunk = s.chunks[index];
    if (!chunk) return false;
    return !(chunk.ownVoiceId && chunk.expressive !== undefined ? chunk.expressive : s.expressive[chunk.language]);
  });
  // A part with its own voice (a character) keeps it; only the document's voice is switched from here
  const own = usePlayerStore((s) => !!s.chunks[index]?.ownVoiceId);
  const switching = usePlayerStore((s) => s.switchingTo !== null);

  const current = data?.voices.find((v) => v.id === voiceId);
  const suggestion = plain && !own && data ? closestExpressive(data.voices, current, current ? data.preferences.voices[current.language] : undefined) : undefined;

  const switchNow = async () => {
    if (!suggestion) return;
    await audioEngine.setVoice(suggestion.id);
    toast.show({ label: `${suggestion.name} is reading now`, description: 'An Expressive voice: it acts out emotions and uses Expressive minutes.' });
  };

  return { plain, current, suggestion, switching, switchNow };
}
