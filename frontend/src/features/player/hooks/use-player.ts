import { useShallow } from 'zustand/react/shallow';

import { globalPosition, usePlayerStore } from '../store/player.store';

/** Whole-document position/total, refreshed as playback advances */
export function usePlayerTimeline() {
  return usePlayerStore(useShallow((s) => ({ ...globalPosition(s), speed: s.speed })));
}

export const formatClock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const formatMinutes = (sec: number) => {
  const m = Math.round(sec / 60);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
