import { Stack } from 'expo-router';
import { useThemeColor } from 'heroui-native';

export default function AppLayout() {
  const background = useThemeColor('background');

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="player" options={{ animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
      <Stack.Screen name="import" options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
