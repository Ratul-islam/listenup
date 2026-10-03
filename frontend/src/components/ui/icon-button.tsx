import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

interface IconButtonProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: number;
  className?: string;
}

/** Bare round icon button (back, bookmark, more); the press state is the only chrome */
export function IconButton({ children, onPress, accessibilityLabel, size = 44, className }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`items-center justify-center rounded-full active:bg-default ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      {children}
    </Pressable>
  );
}
