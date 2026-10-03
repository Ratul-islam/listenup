import type { ReactNode } from 'react';
import { View } from 'react-native';

interface IconTileProps {
  children: ReactNode;
  size?: number;
  /** Squircle (default) or circle */
  round?: boolean;
}

/** Soft violet tile that holds an icon; document types differ by icon, not colour */
export function IconTile({ children, size = 48, round }: IconTileProps) {
  return (
    <View className="items-center justify-center bg-accent-soft-bg" style={{ width: size, height: size, borderRadius: round ? size / 2 : size * 0.32 }}>
      {children}
    </View>
  );
}
