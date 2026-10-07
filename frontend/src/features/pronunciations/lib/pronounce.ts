/** "Say it like this": how the listener wants a word said */
export interface PronunciationRule {
  word: string;
  sayAs: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Letters, marks (Bangla and Hindi vowel signs) and digits make up words in every script
const WORD_CHAR = '[\\p{L}\\p{M}\\p{N}]';
const normal = (word: string) => word.trim().toLowerCase().replace(/\s+/g, ' ');

const compiled = new WeakMap<PronunciationRule[], { pattern: RegExp; byWord: Map<string, string> } | null>();

function compile(rules: PronunciationRule[]) {
  if (compiled.has(rules)) return compiled.get(rules)!;
  const usable = rules.filter((r) => r.word.trim() && r.sayAs.trim()).sort((a, b) => b.word.length - a.word.length);
  const result = usable.length
    ? {
        // The character before is captured rather than looked behind at, which every JS engine supports
        pattern: new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])(${usable.map((r) => escape(r.word.trim()).replace(/\s+/g, '\\s+')).join('|')})(?!${WORD_CHAR})`, 'giu'),
        byWord: new Map(usable.map((r) => [normal(r.word), r.sayAs.trim()])),
      }
    : null;
  compiled.set(rules, result);
  return result;
}

/**
 * The text as it should be said: each word with a pronunciation is swapped for
 * its spelling, whole words only, in any case. Same rules as the server, so
 * voices made on the phone say words the way server voices do.
 */
export function pronounce(text: string, rules: PronunciationRule[]) {
  const lexicon = compile(rules);
  if (!lexicon) return text;
  return text.replace(lexicon.pattern, (match, before: string, word: string) => {
    const sayAs = lexicon.byWord.get(normal(word));
    return sayAs === undefined ? match : before + sayAs;
  });
}

let active: PronunciationRule[] = [];

/** The open document's owner's pronunciations, for voices made on this phone */
export const setActivePronunciations = (rules: PronunciationRule[] | undefined) => {
  active = rules ?? [];
};

/** Text for this phone's voices to say, with the listener's pronunciations */
export const speakable = (text: string) => pronounce(text, active);

export const activePronunciations = () => active;
