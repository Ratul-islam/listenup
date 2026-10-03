import { View } from 'react-native';

interface ProgressBarProps {
  /** 0..1 */
  value: number;
  height?: number;
  className?: string;
}

export function ProgressBar({ value, height = 4, className }: ProgressBarProps) {
  const pct = `${Math.round(Math.min(Math.max(value, 0), 1) * 1000) / 10}%` as const;
  return (
    <View
      className={`w-full overflow-hidden rounded-full bg-surface-tertiary ${className ?? ''}`}
      style={{ height }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
    >
      <View className="bg-accent" style={{ width: pct, height, borderRadius: height }} />
    </View>
  );
}
