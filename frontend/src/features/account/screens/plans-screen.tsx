import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Spinner } from 'heroui-native';
import { Check } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { useTokens } from '@/lib/use-tokens';

import { accountApi } from '../api/account.api';

export const plansKey = ['plans'] as const;

/** The plans, with the current one outlined. Buying isn't open yet. */
export default function PlansScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { data } = useQuery({ queryKey: plansKey, queryFn: accountApi.plans });
  const current = data?.plans.find((p) => p.id === data.current);

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 20 }}>
        <View className="gap-2">
          <ScreenHeader title="Plans" onBack={router.back} />
          {current ? <Text variant="lead">You&apos;re on {current.name}. Paid plans are coming soon.</Text> : null}
        </View>

        {!data ? <Spinner color={t.accent} /> : null}

        {data?.plans.map((plan) => {
          const isCurrent = plan.id === data.current;
          return (
            <GlassCard key={plan.id} className="gap-4 p-5" style={isCurrent ? { borderWidth: 1.5, borderColor: t.accent } : undefined}>
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="text-[20px] font-bold tracking-[-0.3px]">{plan.name}</Text>
                <Text className="text-[15px] font-semibold text-muted">{plan.price ?? 'Free'}</Text>
              </View>
              <View className="gap-2">
                {[`About ${plan.monthlyHours} hours of listening a month`, ...plan.perks].map((perk) => (
                  <View key={perk} className="flex-row items-center gap-2.5">
                    <Check size={16} color={t.accent} strokeWidth={2.4} />
                    <Text className="flex-1 text-[15px]">{perk}</Text>
                  </View>
                ))}
              </View>
              {isCurrent ? (
                <Text className="text-[14px] font-semibold text-accent">Your current plan</Text>
              ) : (
                <PrimaryButton label={plan.purchasable ? `Choose ${plan.name}` : 'Available soon'} size="md" variant="secondary" isDisabled={!plan.purchasable} onPress={() => {}} />
              )}
            </GlassCard>
          );
        })}
      </ScrollView>
    </CloudBackground>
  );
}
