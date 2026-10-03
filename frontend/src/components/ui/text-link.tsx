import { Pressable } from 'react-native';

import { Text } from './text';

interface TextLinkProps {
  children: string;
  onPress: () => void;
  className?: string;
}

/** Inline text action with a comfortable touch target */
export function TextLink({ children, onPress, className }: TextLinkProps) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="link" className={className}>
      {({ pressed }) => (
        <Text
          variant="label"
          className={pressed ? "text-accent-soft-fg opacity-60" : "text-accent-soft-fg"}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}
