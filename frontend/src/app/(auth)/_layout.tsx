import { Stack } from 'expo-router';
import { useThemeColor } from 'heroui-native';

export const unstable_settings = {
  initialRouteName: 'onboarding',
};

export default function AuthLayout() {
  const background = useThemeColor('background');

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: background },
      }}
    />
  );
}
