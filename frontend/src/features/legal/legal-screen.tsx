import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';

import { LAST_UPDATED, LEGAL } from './content';

/** Terms of service or privacy policy, as plain readable text */
export default function LegalScreen() {
  const insets = useSafeAreaInsets();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const page = LEGAL[doc === 'privacy' ? 'privacy' : 'terms'];

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 24 }}>
        <ScreenHeader title={page.title} onBack={router.back} />
        <View className="gap-2">
          <Text variant="caption">Last updated {LAST_UPDATED}</Text>
          <Text variant="lead" className="text-foreground">{page.intro}</Text>
        </View>
        {page.sections.map((section) => (
          <View key={section.title} className="gap-2">
            <Text variant="title">{section.title}</Text>
            {section.paragraphs.map((p) => (
              <Text key={p} className="text-[15px] leading-[24px] text-muted">{p}</Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </CloudBackground>
  );
}
