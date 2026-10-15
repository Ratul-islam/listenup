import type { Lang } from '../ingestion/text/language.js'

/**
 * Where a title's text comes from. Gutenberg books are plain text, cut to the
 * part wanted: from the `fromNth` line reading exactly `from` (skipping
 * contents and prefaces), up to the line reading `to`. Wikisource titles are
 * one page, or a page whose subpages are its `chapters`, in the order it lists them.
 */
export type CatalogSource =
  | { site: 'gutenberg'; id: number; from?: string; fromNth?: number; to?: string }
  | { site: 'wikisource'; lang: Lang; page: string; chapters?: boolean }

export interface CatalogItem {
  id: string
  title: string
  /** The title in English, for titles written in another script */
  englishTitle?: string
  author: string
  language: Lang
  /** One line on what it's about */
  blurb: string
  /** About how long it is at 1x, measured from the cleaned text */
  minutes: number
  source: CatalogSource
}

/**
 * Explore's free classics, hand-picked. Only works in the public domain in
 * Bangladesh, India and the US: authors who died more than 60 years ago
 * (Bangladesh and India) and works published before 1930 (US). Nazrul (died
 * 1976) isn't, until 2037. Added titles are fetched once and shared.
 */
export const CATALOG: CatalogItem[] = [
  {
    id: 'kabuliwala',
    title: 'কাবুলিওয়ালা',
    englishTitle: 'Kabuliwala',
    author: 'রবীন্দ্রনাথ ঠাকুর',
    language: 'bn',
    blurb: 'A fruit seller from Kabul befriends a little girl in Calcutta who reminds him of the daughter he left at home.',
    minutes: 21,
    source: { site: 'wikisource', lang: 'bn', page: 'গল্পগুচ্ছ (প্রথম খণ্ড)/কাবুলিওয়ালা' },
  },
  {
    id: 'the-tell-tale-heart',
    title: 'The Tell-Tale Heart',
    author: 'Edgar Allan Poe',
    language: 'en',
    blurb: 'A murderer insists he is sane while describing, in careful detail, the crime he committed.',
    minutes: 13,
    source: { site: 'gutenberg', id: 2148, from: 'THE TELL-TALE HEART.', fromNth: 2, to: 'BERENICE' },
  },
  {
    id: 'postmaster',
    title: 'পোস্টমাস্টার',
    englishTitle: 'The Postmaster',
    author: 'রবীন্দ্রনাথ ঠাকুর',
    language: 'bn',
    blurb: 'A young postmaster from Calcutta, sent to a remote village, and the orphan girl who looks after him.',
    minutes: 15,
    source: { site: 'wikisource', lang: 'bn', page: 'গল্পগুচ্ছ (প্রথম খণ্ড)/পোস্ট্‌মাস্টার' },
  },
  {
    id: 'the-gift-of-the-magi',
    title: 'The Gift of the Magi',
    author: 'O. Henry',
    language: 'en',
    blurb: 'A young couple with almost no money each sell their most treasured thing to buy the other a Christmas present.',
    minutes: 13,
    source: { site: 'gutenberg', id: 7256 },
  },
  {
    id: 'chhuti',
    title: 'ছুটি',
    englishTitle: 'The Homecoming',
    author: 'রবীন্দ্রনাথ ঠাকুর',
    language: 'bn',
    blurb: 'Phatik, leader of the village boys, is sent to his uncle in Calcutta, and longs for home.',
    minutes: 17,
    source: { site: 'wikisource', lang: 'bn', page: 'গল্পগুচ্ছ (প্রথম খণ্ড)/ছুটি' },
  },
  {
    id: 'the-happy-prince',
    title: 'The Happy Prince',
    author: 'Oscar Wilde',
    language: 'en',
    blurb: 'A golden statue and a swallow give away everything they have to the poor of the city.',
    minutes: 21,
    source: { site: 'gutenberg', id: 902, from: 'The Happy Prince.', to: 'The Nightingale and the Rose.' },
  },
  {
    id: 'mahesh',
    title: 'মহেশ',
    englishTitle: 'Mahesh',
    author: 'শরৎচন্দ্র চট্টোপাধ্যায়',
    language: 'bn',
    blurb: 'Gafur, a poor farmer, and the bullock he loves through a year of drought.',
    minutes: 27,
    source: { site: 'wikisource', lang: 'bn', page: 'শরৎ-সাহিত্য-সংগ্রহ (ত্রয়োদশ সম্ভার)/মহেশ', chapters: true },
  },
  {
    id: 'the-fall-of-the-house-of-usher',
    title: 'The Fall of the House of Usher',
    author: 'Edgar Allan Poe',
    language: 'en',
    blurb: 'A visit to a gloomy mansion, and to the last of the Usher family, ends in horror.',
    minutes: 47,
    // Up to its one footnote
    source: { site: 'gutenberg', id: 932, to: '* Watson, Dr Percival, Spallanzani, and especially the Bishop of Landaff.' },
  },
  {
    id: 'bilasi',
    title: 'বিলাসী',
    englishTitle: 'Bilasi',
    author: 'শরৎচন্দ্র চট্টোপাধ্যায়',
    language: 'bn',
    blurb: "Mrityunjay marries Bilasi, a snake charmer's daughter, and the village never forgives them.",
    minutes: 36,
    source: { site: 'wikisource', lang: 'bn', page: 'শরৎ-সাহিত্য-সংগ্রহ (দশম সম্ভার)/বিলাসী' },
  },
  {
    id: 'abol-tabol',
    title: 'আবোল তাবোল',
    englishTitle: 'Abol Tabol (nonsense rhymes)',
    author: 'সুকুমার রায়',
    language: 'bn',
    blurb: 'Nonsense rhymes full of strange creatures and stranger logic, loved by children and grown-ups alike.',
    minutes: 50,
    source: { site: 'wikisource', lang: 'bn', page: 'সুকুমার সমগ্র রচনাবলী (প্রথম খণ্ড)/আবোল তাবোল', chapters: true },
  },
  {
    id: 'gitanjali',
    title: 'Gitanjali',
    author: 'Rabindranath Tagore',
    language: 'en',
    blurb: "Tagore's own English versions of his song offerings, the book behind his 1913 Nobel Prize.",
    minutes: 71,
    source: { site: 'gutenberg', id: 7164, from: '1.' },
  },
  {
    id: 'devdas',
    title: 'দেবদাস',
    englishTitle: 'Devdas',
    author: 'শরৎচন্দ্র চট্টোপাধ্যায়',
    language: 'bn',
    blurb: 'Devdas and Paro grow up together, are kept apart by family pride, and he never recovers.',
    minutes: 209,
    source: { site: 'wikisource', lang: 'bn', page: 'দেবদাস (শরৎচন্দ্র চট্টোপাধ্যায়)', chapters: true },
  },
  {
    id: 'alices-adventures-in-wonderland',
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    language: 'en',
    blurb: 'Alice follows a white rabbit down a hole into a world where nothing makes sense.',
    minutes: 162,
    source: { site: 'gutenberg', id: 11, from: 'CHAPTER I.' },
  },
  {
    id: 'kapalkundala',
    title: 'কপালকুণ্ডলা',
    englishTitle: 'Kapalkundala',
    author: 'বঙ্কিমচন্দ্র চট্টোপাধ্যায়',
    language: 'bn',
    blurb: 'Stranded on a lonely coast, Nabakumar is saved from a tantric hermit by Kapalkundala, the girl the hermit raised.',
    minutes: 208,
    source: { site: 'wikisource', lang: 'bn', page: 'কপালকুণ্ডলা (বঙ্কিমচন্দ্র চট্টোপাধ্যায়, ১৮৭০)', chapters: true },
  },
  {
    id: 'the-adventures-of-sherlock-holmes',
    title: 'The Adventures of Sherlock Holmes',
    author: 'Arthur Conan Doyle',
    language: 'en',
    blurb: 'Twelve cases for Sherlock Holmes and Dr Watson, starting with A Scandal in Bohemia.',
    minutes: 639,
    source: { site: 'gutenberg', id: 1661, from: 'I. A SCANDAL IN BOHEMIA' },
  },
  {
    id: 'the-jungle-book',
    title: 'The Jungle Book',
    author: 'Rudyard Kipling',
    language: 'en',
    blurb: 'Mowgli, raised by wolves in the Indian jungle, and other animal tales.',
    minutes: 309,
    source: { site: 'gutenberg', id: 236, from: 'Mowgli’s Brothers', fromNth: 2 },
  },
  {
    id: 'frankenstein',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    language: 'en',
    blurb: 'Victor Frankenstein makes a living creature, then spends the rest of his life running from it.',
    minutes: 479,
    source: { site: 'gutenberg', id: 84, from: 'Letter 1', fromNth: 2 },
  },
  {
    id: 'pride-and-prejudice',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    language: 'en',
    blurb: 'Elizabeth Bennet and Mr Darcy badly misjudge each other, in Austen’s sharpest and funniest novel.',
    minutes: 782,
    source: {
      site: 'gutenberg',
      id: 1342,
      // Past the illustrated edition's preface, and up to the printer's name
      from: 'It is a truth universally acknowledged, that a single man in possession',
      to: 'CHISWICK PRESS:--CHARLES WHITTINGHAM AND CO.',
    },
  },
]

export const findCatalogItem = (id: string) => CATALOG.find((item) => item.id === id)
