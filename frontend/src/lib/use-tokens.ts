import { useCSSVariable } from 'uniwind';

const read = (value: string | number | undefined, fallback: string) =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

/** Theme colours resolved for places that need raw values (gradients, icons, shadows) */
export function useTokens() {
  return {
    background: read(useCSSVariable('--color-background'), '#f5f3ff'),
    foreground: read(useCSSVariable('--color-foreground'), '#1b1c2e'),
    muted: read(useCSSVariable('--color-muted'), '#64657a'),
    surface: read(useCSSVariable('--color-surface'), '#ffffff'),
    accent: read(useCSSVariable('--color-accent'), '#6a55e0'),
    accentForeground: read(useCSSVariable('--color-accent-foreground'), '#ffffff'),
    accentSoftBg: read(useCSSVariable('--color-accent-soft-bg'), '#efebff'),
    accentSoftFg: read(useCSSVariable('--color-accent-soft-fg'), '#4b3bb8'),
    periwinkle: read(useCSSVariable('--color-periwinkle'), '#a597f5'),
    border: read(useCSSVariable('--color-border'), '#ecebf5'),
    cloudTop: read(useCSSVariable('--color-cloud-top'), '#f1efff'),
    cloudMid: read(useCSSVariable('--color-cloud-mid'), '#faf9ff'),
    cloudBottom: read(useCSSVariable('--color-cloud-bottom'), '#f3f1ff'),
    glowPink: read(useCSSVariable('--color-glow-pink'), '#fbeaf6'),
    danger: read(useCSSVariable('--color-danger'), '#d63c5e'),
    success: read(useCSSVariable('--color-success'), '#16a06a'),
  };
}

export type Tokens = ReturnType<typeof useTokens>;

/** The one shadow: only for things that float (hero card, tab bar, mini-player, FAB) */
export const cardShadow = '0px 1px 2px rgba(40, 30, 110, 0.04), 0px 8px 24px rgba(40, 30, 110, 0.07)';
