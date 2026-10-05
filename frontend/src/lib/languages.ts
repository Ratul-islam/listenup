/** Languages ListenUp reads, each with voices (same list as the server's) */
export const LANGS = ['en', 'bn', 'hi', 'es', 'pt', 'fr', 'it', 'ja', 'zh', 'ur', 'id'] as const;
export type Lang = (typeof LANGS)[number];

/** Each language in its own words, as listeners look for it */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  bn: 'বাংলা',
  hi: 'हिन्दी',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  zh: '中文',
  ur: 'اردو',
  id: 'Bahasa Indonesia',
};

/** Each language's name in English, as a second line under its own name */
export const LANGUAGE_NAMES_EN: Record<Lang, string> = {
  en: 'English',
  bn: 'Bangla',
  hi: 'Hindi',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  zh: 'Mandarin',
  ur: 'Urdu',
  id: 'Indonesian',
};

/** A value for every language */
export const perLanguage = <T,>(value: (lang: Lang) => T) => Object.fromEntries(LANGS.map((lang) => [lang, value(lang)])) as Record<Lang, T>;

/** Languages written right to left (Urdu), so their text lines up on the right */
export const isRtl = (lang: string | null | undefined) => lang === 'ur';
