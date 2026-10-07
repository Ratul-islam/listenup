/** "0:24", "18:04", "1:02:10": a length as a timeline shows it */
export function formatClock(sec: number) {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Speaking speed per language at 1×, as the server estimates it (CHARS_PER_SECOND)
const CHARS_PER_SECOND: Record<string, number> = { en: 14.5, bn: 12, hi: 13, es: 15, pt: 15, fr: 15, it: 15, ja: 7, zh: 4.5, ur: 12, id: 15 };

/** Roughly how long text takes to say */
export const secondsToSay = (text: string, language: string) => Math.max(1, Math.round(text.trim().length / (CHARS_PER_SECOND[language] ?? 14.5)));

/** What voicing something costs, said plainly: "free" or "about 0:24 of your minutes" */
export const costLabel = (seconds: number, free: boolean) => (free ? 'free on this voice' : `about ${formatClock(seconds)} of your minutes`);
