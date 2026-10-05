import { Platform } from 'react-native';
import Purchases, {
  PRODUCT_CATEGORY,
  STORE_REPLACEMENT_MODE,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from 'react-native-purchases';

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY;

/** Google Play purchases work in this build (Android, with a RevenueCat key) */
export const purchasesAvailable = Platform.OS === 'android' && !!API_KEY;

export type PaidPlan = 'plus' | 'pro';
export type BillingPeriod = 'monthly' | 'yearly';

/**
 * Package identifiers in RevenueCat's current offering. Set them up as custom
 * packages named exactly like this, each pointing at its Play base plan.
 */
export const PACKAGE_IDS: Record<PaidPlan, Record<BillingPeriod, string>> = {
  plus: { monthly: 'plus_monthly', yearly: 'plus_yearly' },
  pro: { monthly: 'pro_monthly', yearly: 'pro_yearly' },
};

/** Google Play one-time products: extra Expressive minutes */
export const STUDIO_PACK_IDS = ['studio_30', 'studio_120'] as const;

let configuredFor: string | null = null;

/** Starts RevenueCat for the signed-in user, so purchases are tied to their account */
export async function identifyPurchaser(userId: string) {
  if (!purchasesAvailable || configuredFor === userId) return;
  if (configuredFor === null) Purchases.configure({ apiKey: API_KEY!, appUserID: userId });
  else await Purchases.logIn(userId);
  configuredFor = userId;
}

/** On sign-out: the next account must not inherit this one's purchases */
export async function forgetPurchaser() {
  if (!configuredFor) return;
  configuredFor = null;
  await Purchases.logOut().catch(() => {});
}

/** Store packages for the paid plans, keyed like PACKAGE_IDS; empty until set up in RevenueCat */
export async function loadPlanPackages() {
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  return Object.fromEntries(packages.map((p) => [p.identifier, p])) as Partial<Record<string, PurchasesPackage>>;
}

export async function loadStudioPacks(): Promise<PurchasesStoreProduct[]> {
  const products = await Purchases.getProducts([...STUDIO_PACK_IDS], PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  return [...products].sort((a, b) => a.price - b.price);
}

/**
 * Buys a plan. Switching plans replaces the current Play subscription (with the
 * unused time credited) instead of adding a second one.
 */
export async function buyPlan(pkg: PurchasesPackage) {
  const info = await Purchases.getCustomerInfo();
  const current = info.activeSubscriptions[0];
  const change = current
    ? { oldProductIdentifier: current.split(':')[0], replacementMode: STORE_REPLACEMENT_MODE.WITH_TIME_PRORATION }
    : null;
  return Purchases.purchasePackage(pkg, null, change);
}

/** The Play product the listener subscribes to now ("plus:monthly"), or null */
export async function activeSubscription() {
  const info = await Purchases.getCustomerInfo();
  return info.activeSubscriptions[0] ?? null;
}

export const buyStudioPack = (product: PurchasesStoreProduct) => Purchases.purchaseStoreProduct(product);

export const restorePurchases = () => Purchases.restorePurchases();

/** The buyer closed Google Play's purchase sheet */
export const isPurchaseCancelled = (error: unknown) => !!(error as { userCancelled?: boolean | null } | null)?.userCancelled;

/** Play's own page for managing (or cancelling) subscriptions to this app */
export const manageSubscriptionsUrl = (packageName: string) => `https://play.google.com/store/account/subscriptions?package=${packageName}`;
