import { LANGUAGE_NAMES, type Lang } from '@/lib/languages';

import type { Board, CommunityItem } from '../api/community.api';

export const BOARD_NAMES: Record<Board, string> = { bn: 'বাংলা', en: 'English', other: 'Other languages' };
export const PLACES = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

/** Which contest board a language competes on */
export const boardOf = (language: string): Board => (language === 'bn' || language === 'en' ? language : 'other');

/** "October" (or "October 2026" with the year) for "2026-10" */
export function monthName(month: string, withYear = false) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC', ...(withYear && { year: 'numeric' }) });
}

/** "12 days left", "Ends today" */
export function timeLeft(endsAt: string) {
  const days = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 1) return 'Ends today';
  return `${days} days left`;
}

export const languageName = (language: string) => LANGUAGE_NAMES[language as Lang] ?? 'Several languages';

/** "Mina Rahman" for your own writing, "from Kabuliwala · Rabindranath Tagore" for a quoted classic */
export const clipCredit = (item: Pick<CommunityItem, 'credit' | 'title' | 'penName'>) => (item.credit ? `${item.title} · ${item.credit}` : item.penName);

/** "1 heart", "12 hearts" */
export const heartsLabel = (n: number) => `${n} heart${n === 1 ? '' : 's'}`;
