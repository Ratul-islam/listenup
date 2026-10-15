import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { TabBar } from '@/components/navigation/tab-bar';
import { useCardInView } from '@/features/library/store/shelf-ui.store';
import { MiniPlayer } from '@/features/player/components/mini-player';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

/** The mini player and the tabs. On the shelf, the top card is the player while it's in view, so the mini player steps aside there. */
function Footer(props: TabBarProps) {
  const cardInView = useCardInView();
  const onShelf = props.state.routes[props.state.index]?.name === 'index';
  return (
    <View className="absolute inset-x-0 bottom-0">
      <MiniPlayer aside={onShelf && cardInView} />
      <TabBar {...props} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }} tabBar={(props) => <Footer {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="studio" />
    </Tabs>
  );
}
