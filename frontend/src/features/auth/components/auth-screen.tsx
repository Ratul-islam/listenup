import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMark } from '@/components/ui/app-mark';
import { CloudBackground } from '@/components/ui/cloud-background';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useTokens } from '@/lib/use-tokens';

interface AuthScreenProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Pinned to the bottom of the screen when there is room */
  footer?: ReactNode;
}

export function AuthScreen({ title, description, children, footer }: AuthScreenProps) {
  const insets = useSafeAreaInsets();
  const t = useTokens();

  return (
    <CloudBackground>
      <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
        <View className="h-14 flex-row items-center justify-between px-5">
          {router.canGoBack() ? (
            <IconButton accessibilityLabel="Go back" onPress={router.back} size={44}>
              <ChevronLeft size={22} color={t.foreground} />
            </IconButton>
          ) : (
            <View />
          )}
          <AppMark size={32} />
        </View>

        <KeyboardAwareScrollView
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
        >
          <View className="gap-2 pb-8 pt-4">
            <Text variant="h1" accessibilityRole="header">{title}</Text>
            {description ? <Text variant="lead">{description}</Text> : null}
          </View>

          {children}

          {footer ? <View className="mt-auto items-center pt-10">{footer}</View> : null}
        </KeyboardAwareScrollView>
      </View>
    </CloudBackground>
  );
}
