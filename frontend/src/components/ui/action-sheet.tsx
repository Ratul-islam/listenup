import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './text';

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Bottom sheet modal for short lists of actions or small forms */
export function ActionSheet({ visible, onClose, title, children }: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable className="flex-1 bg-black/30" onPress={onClose} accessibilityLabel="Close" />
      <View
        className="gap-2 rounded-t-[28px] bg-surface px-5 pt-3 dark:border dark:border-border"
        style={{ paddingBottom: insets.bottom + 16, boxShadow: '0px -10px 40px rgba(27, 28, 46, 0.15)' }}
      >
        <View className="mb-2 h-1.5 w-10 self-center rounded-full bg-separator" />
        {title ? (
          <Text variant="title" className="mb-1" numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {children}
      </View>
    </Modal>
  );
}

interface SheetActionProps {
  icon: ReactNode;
  label: string;
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function SheetAction({ icon, label, detail, onPress, destructive, disabled }: SheetActionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`flex-row items-center gap-3.5 rounded-2xl px-2 py-3.5 active:bg-default ${disabled ? 'opacity-50' : ''}`}
    >
      <View className="w-6 items-center">{icon}</View>
      <View className="flex-1">
        <Text className={`text-[16px] font-medium ${destructive ? 'text-danger' : ''}`}>{label}</Text>
        {detail ? <Text variant="caption">{detail}</Text> : null}
      </View>
    </Pressable>
  );
}
