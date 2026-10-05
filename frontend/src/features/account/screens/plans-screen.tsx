import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PurchasesStoreProduct } from 'react-native-purchases';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ChoiceChips, ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useActiveSubscription, usePlanPackages, useStoreAction, useStudioPacks } from '@/features/billing/hooks/use-store';
import {
  buyPlan,
  buyStudioPack,
  isPurchaseCancelled,
  manageSubscriptionsUrl,
  PACKAGE_IDS,
  purchasesAvailable,
  restorePurchases,
  STUDIO_PACK_IDS,
  type BillingPeriod,
  type PaidPlan,
} from '@/features/billing/lib/purchases';
import { useUsage } from '@/features/voices/hooks/use-voices';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { accountApi, type PlanInfo } from '../api/account.api';
import { formatAllowance, formatResetDate } from '../lib/allowance';

export const plansKey = ['plans'] as const;

const PACKAGE = Constants.expoConfig?.android?.package ?? 'dev.ratul.tts';
const PERIOD_LABEL: Record<BillingPeriod, string> = { monthly: 'Monthly', yearly: 'Yearly' };
const PER: Record<BillingPeriod, string> = { monthly: 'a month', yearly: 'a year' };
const PACK_MINUTES: Record<(typeof STUDIO_PACK_IDS)[number], number> = { studio_30: 30, studio_120: 120 };

/** What a plan's minutes buy, in the words shown on its card */
const allowanceLines = (plan: PlanInfo) => [
  `${formatAllowance(plan.naturalMinutes)} of Natural voices a month`,
  plan.expressiveTrial
    ? `${plan.expressiveMinutes} minutes of Expressive voices to try`
    : `${formatAllowance(plan.expressiveMinutes)} of Expressive voices, with emotions`,
];

const isPaid = (id: string): id is PaidPlan => id === 'plus' || id === 'pro';

/** The plans with local Google Play prices; buying, switching and Studio packs */
export default function PlansScreen() {
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: plansKey, queryFn: accountApi.plans });
  const usage = useUsage();
  const packages = usePlanPackages();
  const packs = useStudioPacks();
  const active = useActiveSubscription();
  const store = useStoreAction();
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [busy, setBusy] = useState<string | null>(null);

  const current = data?.plans.find((p) => p.id === data.current);
  const sellable = !!data?.billingEnabled && purchasesAvailable;
  const plan = usage.data?.plan;

  const run = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusy(id);
    try {
      await store.mutateAsync(action);
      haptics.success();
      toast.show({ variant: 'success', label: success });
    } catch (e) {
      if (!isPurchaseCancelled(e)) toast.show({ variant: 'danger', label: getErrorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const status = !current
    ? null
    : plan?.expiresAt && isPaid(current.id)
      ? `You're on ${current.name}. It ${plan.renews ? 'renews' : 'ends'} on ${formatResetDate(plan.expiresAt.slice(0, 10))}.`
      : `You're on ${current.name}.`;

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 20 }}>
        <View className="gap-2">
          <ScreenHeader title="Plans" onBack={router.back} />
          {status ? <Text variant="lead">{status}</Text> : null}
          <Text variant="caption">
            Phone voices are free and unlimited. Natural voices read clearly; Expressive voices add emotions and HD Bangla. Audio you&apos;ve heard
            before replays for free.
          </Text>
        </View>

        {sellable ? (
          <View className="-mx-3 -mb-3">
            <ChoiceChips options={['monthly', 'yearly'] as BillingPeriod[]} value={period} format={(v) => PERIOD_LABEL[v]} onChange={setPeriod} />
          </View>
        ) : null}

        {!data ? <Spinner color={t.accent} /> : null}

        {data?.plans.map((p) => {
          const isCurrent = p.id === data.current;
          const pkg = isPaid(p.id) ? packages.data?.[PACKAGE_IDS[p.id][period]] : undefined;
          const price = pkg ? `${pkg.product.priceString} ${PER[period]}` : (p.price ?? 'Free');
          return (
            <GlassCard key={p.id} className="gap-4 p-5" style={isCurrent ? { borderWidth: 1.5, borderColor: t.accent } : undefined}>
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="text-[20px] font-bold tracking-[-0.3px]">{p.name}</Text>
                <Text className="text-[15px] font-semibold text-muted">{price}</Text>
              </View>
              <View className="gap-2">
                {[...allowanceLines(p), ...p.perks].map((perk) => (
                  <View key={perk} className="flex-row items-center gap-2.5">
                    <Check size={16} color={t.accent} strokeWidth={2.4} />
                    <Text className="flex-1 text-[15px]">{perk}</Text>
                  </View>
                ))}
              </View>
              {isCurrent && pkg && active.data && pkg.product.identifier !== active.data ? (
                // Same plan, other billing period: Play swaps the subscription and credits unused time
                <PrimaryButton
                  label={`Switch to ${PERIOD_LABEL[period].toLowerCase()} billing`}
                  size="md"
                  variant="secondary"
                  isDisabled={!!busy}
                  isLoading={busy === p.id}
                  onPress={() => void run(p.id, () => buyPlan(pkg), `${p.name} is now billed ${PERIOD_LABEL[period].toLowerCase()}`)}
                />
              ) : isCurrent ? (
                <Text className="text-[14px] font-semibold text-accent">Your current plan</Text>
              ) : isPaid(p.id) ? (
                <PrimaryButton
                  label={pkg ? `Choose ${p.name}` : 'Available soon'}
                  size="md"
                  variant={p.id === 'plus' ? 'primary' : 'secondary'}
                  isDisabled={!pkg || !!busy}
                  isLoading={busy === p.id}
                  onPress={() => pkg && void run(p.id, () => buyPlan(pkg), `You're on ${p.name}`)}
                />
              ) : null}
            </GlassCard>
          );
        })}

        {packs.data?.length ? (
          <View className="gap-3">
            <View className="gap-1">
              <Text className="text-[17px] font-semibold">More Expressive minutes</Text>
              <Text variant="caption">Studio packs are used after your monthly minutes, and they never expire.</Text>
            </View>
            {packs.data.map((product: PurchasesStoreProduct) => {
              const minutes = PACK_MINUTES[product.identifier as keyof typeof PACK_MINUTES] ?? 0;
              return (
                <PrimaryButton
                  key={product.identifier}
                  label={`${minutes} minutes · ${product.priceString}`}
                  size="md"
                  variant="secondary"
                  isDisabled={!!busy}
                  isLoading={busy === product.identifier}
                  onPress={() => void run(product.identifier, () => buyStudioPack(product), `${minutes} Expressive minutes added`)}
                />
              );
            })}
          </View>
        ) : null}

        {sellable ? (
          <View className="items-center gap-3 pt-2">
            {current && isPaid(current.id) ? (
              <TextLink onPress={() => void Linking.openURL(manageSubscriptionsUrl(PACKAGE))}>Manage or cancel in Google Play</TextLink>
            ) : null}
            <TextLink onPress={() => void run('restore', restorePurchases, 'Purchases restored')}>Restore purchases</TextLink>
            <Text variant="caption" className="text-center">
              Subscriptions renew until you cancel in Google Play. No free trials that quietly turn into charges.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </CloudBackground>
  );
}
