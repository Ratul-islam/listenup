import { Text } from './text';

/** "ListenUp" with the periwinkle "Up" */
export function Wordmark({ size = 44 }: { size?: number }) {
  return (
    <Text
      variant="display"
      style={{ fontSize: size, lineHeight: size * 1.18 }}
      accessibilityRole="header"
      accessibilityLabel="ListenUp"
    >
      Listen<Text variant="display" className="text-periwinkle" style={{ fontSize: size, lineHeight: size * 1.18 }}>Up</Text>
    </Text>
  );
}
