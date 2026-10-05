import { Platform, TurboModuleRegistry } from 'react-native';
import { create } from 'zustand';

/**
 * Whether this build has the ads SDK. Builds made before ads were added (or
 * Expo Go) don't, and importing the library there crashes, so every file that
 * imports it is loaded only when this is true.
 */
export const adsAvailable = Platform.OS === 'android' && TurboModuleRegistry.get('RNGoogleMobileAdsModule') != null;

// Google's sample ad units for Android: they only ever serve test ads
const TEST_UNITS = { banner: 'ca-app-pub-3940256099942544/9214589741', rewarded: 'ca-app-pub-3940256099942544/5224354917' };

/**
 * Ad units from AdMob. Development builds fall back to Google's test ads;
 * release builds without real units show no ads at all.
 */
export const AD_UNITS = {
  banner: process.env.EXPO_PUBLIC_ADMOB_BANNER_ID || (__DEV__ ? TEST_UNITS.banner : null),
  rewarded: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID || (__DEV__ ? TEST_UNITS.rewarded : null),
};

interface AdsSdkState {
  /** Consent gathered and the SDK started */
  ready: boolean;
  /** Consent allows requesting ads (always true outside the EEA/UK) */
  canRequestAds: boolean;
  /** The listener must be able to change their ad privacy choices (EEA/UK) */
  privacyOptionsRequired: boolean;
  /** A rewarded ad is loaded and can be shown now */
  rewardReady: boolean;
  /** Shows the loaded rewarded ad; set by the rewarded-ad host */
  showReward: (() => void) | null;
}

export const useAdsSdk = create<AdsSdkState>(() => ({
  ready: false,
  canRequestAds: false,
  privacyOptionsRequired: false,
  rewardReady: false,
  showReward: null,
}));

let starting: Promise<void> | null = null;

/**
 * Asks for ad consent where the law needs it (Google's consent form, EEA/UK),
 * then starts the ads SDK. Only called for Free users, once per launch.
 */
export function startAds() {
  if (!adsAvailable || (!AD_UNITS.banner && !AD_UNITS.rewarded)) return Promise.resolve();
  starting ??= (async () => {
    const { default: mobileAds, AdsConsent, AdsConsentPrivacyOptionsRequirementStatus } = await import('react-native-google-mobile-ads');
    // A consent error still allows trying to request ads (Google's guidance)
    const info = await AdsConsent.gatherConsent().catch(() => null);
    const canRequestAds = info?.canRequestAds ?? true;
    if (canRequestAds) await mobileAds().initialize();
    useAdsSdk.setState({
      ready: true,
      canRequestAds,
      privacyOptionsRequired: info?.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
    });
  })().catch(() => {
    starting = null;
  });
  return starting;
}

/** Google's form for changing ad privacy choices (shown from Studio when required) */
export async function showAdPrivacyOptions() {
  if (!adsAvailable) return;
  const { default: mobileAds, AdsConsent } = await import('react-native-google-mobile-ads');
  const info = await AdsConsent.showPrivacyOptionsForm();
  useAdsSdk.setState({ canRequestAds: info.canRequestAds });
  if (info.canRequestAds) await mobileAds().initialize();
}
