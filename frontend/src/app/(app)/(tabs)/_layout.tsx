import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { TabBar } from '@/components/navigation/tab-bar';
import { MiniPlayer } from '@/features/player/components/mini-player';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      tabBar={(props) => (
        <View className="absolute inset-x-0 bottom-0">
          <MiniPlayer />
          <TabBar {...props} />
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="studio" />
    </Tabs>
  );
}
