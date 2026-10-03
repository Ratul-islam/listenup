import { Spinner } from 'heroui-native';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { useTokens } from '@/lib/use-tokens';

import { Text } from './text';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  isLoading?: boolean;
  isDisabled?: boolean;
  /** Accent fill, or a quiet surface button for secondary actions */
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'lg';
  className?: string;
}

/** Pill button: solid accent, or a quiet surface button for secondary actions */
export function PrimaryButton({
  label,
  onPress,
  icon,
  isLoading,
  isDisabled,
  variant = 'primary',
  size = 'lg',
  className,
}: PrimaryButtonProps) {
  const t = useTokens();
  const disabled = isDisabled || isLoading;
  const glass = variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: isLoading }}
      className={`flex-row items-center justify-center gap-2.5 rounded-full active:opacity-85 ${size === 'lg' ? 'h-14 px-6' : 'h-12 px-5'} ${glass ? 'bg-surface dark:border dark:border-border' : 'bg-accent'} ${disabled ? 'opacity-50' : ''} ${className ?? ''}`}
    >
      {isLoading ? <Spinner size="sm" color={glass ? t.foreground : t.accentForeground} /> : icon}
      <Text className={`${size === 'lg' ? 'text-[16px]' : 'text-[15px]'} font-semibold ${glass ? 'text-foreground' : 'text-accent-foreground'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
