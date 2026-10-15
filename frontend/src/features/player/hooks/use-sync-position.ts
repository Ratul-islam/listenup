import { useShallow } from 'zustand/react/shallow';

import { spokenPosition } from '../lib/sync';
import { usePlayerStore, type PlayerState } from '../store/player.store';

const locate = (s: PlayerState) => spokenPosition(s.chunks[s.chunkIndex], s.playing, s.positionMs);

/** The sentence being spoken in the current part. Changes only when the voice moves to another sentence. */
export function useSpokenSentence() {
  return usePlayerStore((s) => locate(s).sentenceIndex);
}

/**
 * The sentence being spoken and how far into it the voice is, in whole words:
 * `spoken` characters of the sentence are said or being said. Changes once per word.
 */
export function useSpokenWords() {
  return usePlayerStore(
    useShallow((s) => {
      const chunk = s.chunks[s.chunkIndex];
      const { sentenceIndex, char } = locate(s);
      const sentence = chunk?.sentences[sentenceIndex];
      if (!chunk || !sentence) return { sentenceIndex: 0, spoken: 0 };
      const text = chunk.text.slice(sentence.start, sentence.end);
      const at = Math.max(0, Math.min(Math.round(char - sentence.start), text.length));
      // Whole words: reach to the end of the word being said
      const rest = text.slice(at).search(/\s/);
      return { sentenceIndex, spoken: rest === -1 ? text.length : at + rest };
    }),
  );
}

/** The character whose words are being spoken, or null while the narrator reads */
export function useSpokenSpeaker() {
  return usePlayerStore((s) => {
    const speakers = s.chunks[s.chunkIndex]?.expressions.speakers;
    if (!speakers?.length) return null;
    const { char } = locate(s);
    return speakers.find((m) => char >= m.start && char < m.end)?.name ?? null;
  });
}

/** The start of the sentence being spoken, as a character of the current part: where "from this line" begins */
export function spokenLineStart() {
  const s = usePlayerStore.getState();
  const chunk = s.chunks[s.chunkIndex];
  return chunk?.sentences[locate(s).sentenceIndex]?.start ?? 0;
}
